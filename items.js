const express = require('express');
const pool = require('../config/db');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

const ALLOWED_CATEGORIES = [
  'Keys & Access Cards',
  'Electronics',
  'ID Cards & Documents',
  'Bags & Clothing',
  'Books & Stationery',
  'Other'
];

// Helper: sanitize item fields so private_details and private contact info NEVER leak publicly
function sanitizeItem(item, currentUser) {
  const isAdmin = currentUser && currentUser.role === 'admin';
  const isOwner = currentUser && Number(currentUser.id) === Number(item.reporter_id);

  const sanitized = {
    id: item.id,
    reporter_id: item.reporter_id,
    reporter_name: item.reporter_name, // Public display name only (no email/phone exposed publicly)
    report_type: item.report_type,
    title: item.title,
    category: item.category,
    public_description: item.public_description,
    campus_location: item.campus_location,
    incident_date: item.incident_date,
    image_url: item.image_url,
    status: item.status,
    returned_at: item.returned_at,
    created_at: item.created_at,
    updated_at: item.updated_at,
    is_owner: Boolean(isOwner)
  };

  // Only expose private_details to the original reporter or an administrator
  if (isAdmin || isOwner) {
    sanitized.private_details = item.private_details;
  }

  // Only expose reporter contact details to administrators
  if (isAdmin) {
    sanitized.reporter_email = item.reporter_email;
    sanitized.reporter_phone = item.reporter_phone;
    sanitized.reporter_reg_no = item.student_or_staff_id;
  }

  return sanitized;
}

// GET /api/items - Browse & filter all lost and found reports
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { keyword, category, location, date, type, status } = req.query;

    let sql = `
      SELECT i.*, u.full_name AS reporter_name, u.email AS reporter_email,
             u.phone AS reporter_phone, u.student_or_staff_id
      FROM items i
      JOIN users u ON i.reporter_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (keyword && keyword.trim()) {
      // Search ONLY public fields (title, public_description, campus_location) - NEVER private_details!
      sql += ` AND (i.title LIKE ? OR i.public_description LIKE ? OR i.campus_location LIKE ?)`;
      const term = `%${keyword.trim()}%`;
      params.push(term, term, term);
    }

    if (category && category !== 'ALL') {
      sql += ` AND i.category = ?`;
      params.push(category);
    }

    if (location && location.trim()) {
      sql += ` AND i.campus_location LIKE ?`;
      params.push(`%${location.trim()}%`);
    }

    if (date && date.trim()) {
      sql += ` AND i.incident_date = ?`;
      params.push(date.trim());
    }

    if (type && (type === 'LOST' || type === 'FOUND')) {
      sql += ` AND i.report_type = ?`;
      params.push(type);
    }

    if (status && (status === 'OPEN' || status === 'RETURNED')) {
      sql += ` AND i.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY CASE WHEN i.status = 'OPEN' THEN 0 ELSE 1 END, i.incident_date DESC, i.created_at DESC`;

    const [rows] = await pool.query(sql, params);
    const items = rows.map((row) => sanitizeItem(row, req.user));

    res.json({ items });
  } catch (error) {
    console.error('Fetch items error:', error);
    res.status(500).json({ message: 'Failed to load lost and found listings.' });
  }
});

// GET /api/items/my/reports - Get logged-in student's own reports
router.get('/my/reports', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT i.*, u.full_name AS reporter_name,
              (SELECT COUNT(*) FROM claims c WHERE c.item_id = i.id) AS claim_count
       FROM items i
       JOIN users u ON i.reporter_id = u.id
       WHERE i.reporter_id = ?
       ORDER BY i.created_at DESC`,
      [req.user.id]
    );

    const items = rows.map((row) => ({
      ...sanitizeItem(row, req.user),
      claim_count: row.claim_count
    }));

    res.json({ items });
  } catch (error) {
    console.error('Fetch my reports error:', error);
    res.status(500).json({ message: 'Failed to load your reported items.' });
  }
});

// GET /api/items/:id - Get single item details (enforcing backend privacy)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT i.*, u.full_name AS reporter_name, u.email AS reporter_email,
              u.phone AS reporter_phone, u.student_or_staff_id
       FROM items i
       JOIN users u ON i.reporter_id = u.id
       WHERE i.id = ? LIMIT 1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Item report not found.' });
    }

    const item = sanitizeItem(rows[0], req.user);

    // Check if logged-in student already submitted a claim on this item
    let myClaim = null;
    if (req.user && req.user.role === 'student') {
      const [claimRows] = await pool.query(
        `SELECT id, evidence_description, status, admin_notes, collection_instructions, created_at, reviewed_at
         FROM claims WHERE item_id = ? AND claimant_id = ? LIMIT 1`,
        [req.params.id, req.user.id]
      );
      if (claimRows.length > 0) {
        myClaim = claimRows[0];
      }
    }

    res.json({ item, myClaim });
  } catch (error) {
    console.error('Get item detail error:', error);
    res.status(500).json({ message: 'Failed to load item details.' });
  }
});

// POST /api/items - Create a new Lost or Found report
router.post('/', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const {
      report_type,
      title,
      category,
      public_description,
      private_details,
      campus_location,
      incident_date
    } = req.body;

    // Validation
    if (!['LOST', 'FOUND'].includes(report_type)) {
      return res.status(400).json({ message: 'Please specify whether the item was LOST or FOUND.' });
    }
    if (!title || title.trim().length < 3) {
      return res.status(400).json({ message: 'Item title is required (at least 3 characters).' });
    }
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Please select a valid item category.' });
    }
    if (!public_description || public_description.trim().length < 10) {
      return res.status(400).json({
        message: 'Public description must be at least 10 characters to help identify the item.'
      });
    }
    if (report_type === 'FOUND' && (!private_details || private_details.trim().length < 5)) {
      return res.status(400).json({
        message: 'For FOUND items, please enter private identifying details (at least 5 characters) visible only to you and the admin.'
      });
    }
    if (!campus_location || campus_location.trim().length < 2) {
      return res.status(400).json({ message: 'Please provide the UCU campus location (e.g., N5B, Hamu Mukasa Library).' });
    }
    if (!incident_date) {
      return res.status(400).json({ message: 'Please select the date when the item was lost or found.' });
    }

    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
    const cleanPrivateDetails = report_type === 'FOUND' ? private_details.trim() : null;

    const [result] = await pool.query(
      `INSERT INTO items
       (reporter_id, report_type, title, category, public_description, private_details, campus_location, incident_date, image_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      [
        req.user.id,
        report_type,
        title.trim(),
        category,
        public_description.trim(),
        cleanPrivateDetails,
        campus_location.trim(),
        incident_date,
        image_url
      ]
    );

    res.status(201).json({
      message: `${report_type === 'LOST' ? 'Lost' : 'Found'} item report published successfully.`,
      itemId: result.insertId
    });
  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ message: 'Failed to submit item report. Please check your inputs and try again.' });
  }
});

// PUT /api/items/:id - Edit own report (enforces ownership on backend)
router.put('/:id', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM items WHERE id = ? LIMIT 1', [req.params.id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'Item report not found.' });
    }

    const existing = existingRows[0];

    // Strict ownership enforcement on backend
    if (Number(existing.reporter_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Permission denied. You may only edit reports that you created.'
      });
    }

    if (existing.status === 'RETURNED') {
      return res.status(400).json({
        message: 'This item has already been marked as RETURNED and can no longer be edited.'
      });
    }

    const {
      title,
      category,
      public_description,
      private_details,
      campus_location,
      incident_date
    } = req.body;

    if (!title || title.trim().length < 3) {
      return res.status(400).json({ message: 'Item title must be at least 3 characters long.' });
    }
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Please select a valid category.' });
    }
    if (!public_description || public_description.trim().length < 10) {
      return res.status(400).json({ message: 'Public description must be at least 10 characters long.' });
    }
    if (existing.report_type === 'FOUND' && (!private_details || private_details.trim().length < 5)) {
      return res.status(400).json({
        message: 'Private identifying details are required for found items (at least 5 characters).'
      });
    }
    if (!campus_location || campus_location.trim().length < 2) {
      return res.status(400).json({ message: 'Campus location is required.' });
    }
    if (!incident_date) {
      return res.status(400).json({ message: 'Date is required.' });
    }

    const image_url = req.file ? `/uploads/${req.file.filename}` : existing.image_url;
    const cleanPrivateDetails = existing.report_type === 'FOUND' ? private_details.trim() : null;

    await pool.query(
      `UPDATE items
       SET title = ?, category = ?, public_description = ?, private_details = ?,
           campus_location = ?, incident_date = ?, image_url = ?
       WHERE id = ?`,
      [
        title.trim(),
        category,
        public_description.trim(),
        cleanPrivateDetails,
        campus_location.trim(),
        incident_date,
        image_url,
        req.params.id
      ]
    );

    res.json({ message: 'Item report updated successfully.' });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ message: 'Failed to update item report.' });
  }
});

module.exports = router;
