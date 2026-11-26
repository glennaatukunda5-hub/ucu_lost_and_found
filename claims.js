const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/claims - Student submits a private ownership claim on a FOUND item
router.post('/', requireAuth, async (req, res) => {
  try {
    const { item_id, evidence_description } = req.body;

    if (!item_id) {
      return res.status(400).json({ message: 'Target item ID is required.' });
    }
    if (!evidence_description || evidence_description.trim().length < 15) {
      return res.status(400).json({
        message: 'Please provide specific ownership evidence (at least 15 characters), such as serial numbers, engravings, or hidden contents.'
      });
    }

    const [itemRows] = await pool.query('SELECT * FROM items WHERE id = ? LIMIT 1', [item_id]);
    if (itemRows.length === 0) {
      return res.status(404).json({ message: 'The requested item does not exist.' });
    }

    const item = itemRows[0];

    // Rule: Claims can only be submitted on FOUND items
    if (item.report_type !== 'FOUND') {
      return res.status(400).json({
        message: 'Ownership claims can only be submitted for FOUND item listings.'
      });
    }

    // Rule: Prevent further claims after an item has been returned
    if (item.status === 'RETURNED') {
      return res.status(400).json({
        message: 'This item has already been returned to its owner. No further claims are accepted.'
      });
    }

    // Rule: A student must not claim an item they reported as found
    if (Number(item.reporter_id) === Number(req.user.id)) {
      return res.status(403).json({
        message: 'You cannot submit an ownership claim on an item that you reported as found.'
      });
    }

    // Check if an approved claim already exists for this item
    const [approvedRows] = await pool.query(
      "SELECT id FROM claims WHERE item_id = ? AND status = 'APPROVED' LIMIT 1",
      [item_id]
    );
    if (approvedRows.length > 0) {
      return res.status(409).json({
        message: 'Another ownership claim for this item has already been approved for collection.'
      });
    }

    // Check if student already claimed this item
    const [existingClaim] = await pool.query(
      'SELECT id FROM claims WHERE item_id = ? AND claimant_id = ? LIMIT 1',
      [item_id, req.user.id]
    );
    if (existingClaim.length > 0) {
      return res.status(409).json({
        message: 'You have already submitted a claim for this item. Check your dashboard for updates.'
      });
    }

    const [result] = await pool.query(
      `INSERT INTO claims (item_id, claimant_id, evidence_description, status)
       VALUES (?, ?, ?, 'PENDING')`,
      [item_id, req.user.id, evidence_description.trim()]
    );

    res.status(201).json({
      message: 'Ownership claim submitted privately. An administrator will review your evidence shortly.',
      claimId: result.insertId
    });
  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({ message: 'Failed to submit ownership claim. Please try again.' });
  }
});

// GET /api/claims/my - Student views ONLY their own claim records
router.get('/my', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.item_id, c.evidence_description, c.status, c.admin_notes,
              c.collection_instructions, c.created_at, c.reviewed_at,
              i.title AS item_title, i.category AS item_category, i.campus_location,
              i.incident_date, i.status AS item_status, i.image_url
       FROM claims c
       JOIN items i ON c.item_id = i.id
       WHERE c.claimant_id = ?
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    res.json({ claims: rows });
  } catch (error) {
    console.error('Fetch my claims error:', error);
    res.status(500).json({ message: 'Failed to retrieve your claim records.' });
  }
});

// GET /api/claims/admin/all - Administrator views all claims + private item details for comparison
router.get('/admin/all', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.item_id, c.claimant_id, c.evidence_description, c.status,
              c.admin_notes, c.collection_instructions, c.created_at, c.reviewed_at,
              i.title AS item_title, i.category AS item_category, i.public_description,
              i.private_details AS item_private_details, i.campus_location,
              i.incident_date, i.status AS item_status, i.image_url,
              claimant.full_name AS claimant_name, claimant.student_or_staff_id AS claimant_reg_no,
              claimant.email AS claimant_email, claimant.phone AS claimant_phone,
              reporter.full_name AS reporter_name, reporter.phone AS reporter_phone
       FROM claims c
       JOIN items i ON c.item_id = i.id
       JOIN users claimant ON c.claimant_id = claimant.id
       JOIN users reporter ON i.reporter_id = reporter.id
       ORDER BY CASE WHEN c.status = 'PENDING' THEN 0 WHEN c.status = 'APPROVED' THEN 1 ELSE 2 END, c.created_at DESC`
    );

    res.json({ claims: rows });
  } catch (error) {
    console.error('Admin fetch claims error:', error);
    res.status(500).json({ message: 'Failed to load claims for administrative review.' });
  }
});

// PATCH /api/claims/:id/review - Administrator approves or rejects a claim
router.patch('/:id/review', requireAuth, requireAdmin, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { decision, admin_notes, collection_instructions } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ message: 'Decision must be either APPROVED or REJECTED.' });
    }
    if (!admin_notes || admin_notes.trim().length < 5) {
      return res.status(400).json({
        message: 'Please record a clear reason/note explaining your decision (at least 5 characters).'
      });
    }
    if (decision === 'APPROVED' && (!collection_instructions || collection_instructions.trim().length < 5)) {
      return res.status(400).json({
        message: 'When approving a claim, please specify where and when the student should collect the item.'
      });
    }

    await connection.beginTransaction();

    const [claimRows] = await connection.query(
      `SELECT c.*, i.status AS item_status
       FROM claims c
       JOIN items i ON c.item_id = i.id
       WHERE c.id = ? FOR UPDATE`,
      [req.params.id]
    );

    if (claimRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Claim record not found.' });
    }

    const claim = claimRows[0];

    if (claim.item_status === 'RETURNED') {
      await connection.rollback();
      return res.status(400).json({
        message: 'This item has already been marked as RETURNED. Claim decisions can no longer be changed.'
      });
    }

    if (decision === 'APPROVED') {
      // Prevent more than one approved claim for the same item
      const [existingApproved] = await connection.query(
        "SELECT id FROM claims WHERE item_id = ? AND status = 'APPROVED' AND id != ? LIMIT 1",
        [claim.item_id, claim.id]
      );
      if (existingApproved.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          message: 'Another claim for this item is already approved. Reject that claim first if you wish to approve a different claimant.'
        });
      }
    }

    await connection.query(
      `UPDATE claims
       SET status = ?, admin_notes = ?, collection_instructions = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [
        decision,
        admin_notes.trim(),
        decision === 'APPROVED' ? collection_instructions.trim() : null,
        req.user.id,
        claim.id
      ]
    );

    await connection.commit();

    res.json({
      message:
        decision === 'APPROVED'
          ? 'Claim approved for collection. Remember to confirm return once the student picks up the item.'
          : 'Claim rejected and reason recorded.'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Review claim error:', error);
    res.status(500).json({ message: 'Failed to process claim decision.' });
  } finally {
    connection.release();
  }
});

// PATCH /api/claims/:id/confirm-return - Administrator confirms item collection & marks item RETURNED
router.patch('/:id/confirm-return', requireAuth, requireAdmin, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [claimRows] = await connection.query(
      `SELECT c.*, i.status AS item_status
       FROM claims c
       JOIN items i ON c.item_id = i.id
       WHERE c.id = ? FOR UPDATE`,
      [req.params.id]
    );

    if (claimRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Claim record not found.' });
    }

    const claim = claimRows[0];

    if (claim.status !== 'APPROVED') {
      await connection.rollback();
      return res.status(400).json({
        message: 'Only an APPROVED claim can be confirmed as returned.'
      });
    }

    if (claim.item_status === 'RETURNED') {
      await connection.rollback();
      return res.status(400).json({
        message: 'This item has already been marked as RETURNED.'
      });
    }

    // Mark the item as RETURNED
    await connection.query(
      `UPDATE items
       SET status = 'RETURNED', returned_at = NOW(), confirmed_by = ?
       WHERE id = ?`,
      [req.user.id, claim.item_id]
    );

    // Automatically reject any other lingering PENDING claims on the same item
    await connection.query(
      `UPDATE claims
       SET status = 'REJECTED',
           admin_notes = COALESCE(admin_notes, 'Item returned to verified owner.'),
           reviewed_by = ?,
           reviewed_at = NOW()
       WHERE item_id = ? AND id != ? AND status = 'PENDING'`,
      [req.user.id, claim.item_id, claim.id]
    );

    await connection.commit();

    res.json({
      message: 'Return confirmed! The listing is now publicly marked as RETURNED and closed to further claims.'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Confirm return error:', error);
    res.status(500).json({ message: 'Failed to confirm item return.' });
  } finally {
    connection.release();
  }
});

module.exports = router;
