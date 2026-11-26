const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// GET /api/admin/users - List user profiles without password hashes
router.get('/users', async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, full_name, student_or_staff_id, email, phone, role, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ users });
  } catch (error) {
    console.error('Admin fetch users error:', error);
    res.status(500).json({ message: 'Failed to load user accounts.' });
  }
});

// DELETE /api/admin/items/:id - Delete a listing and its related claims
router.delete('/items/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM items WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Item report not found.' });
    }

    res.json({ message: 'Listing and its related claims were deleted.' });
  } catch (error) {
    console.error('Admin delete listing error:', error);
    res.status(500).json({ message: 'Failed to delete listing.' });
  }
});

module.exports = router;
