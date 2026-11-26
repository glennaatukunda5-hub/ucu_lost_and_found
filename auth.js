const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register - Register a new student account
router.post('/register', async (req, res) => {
  try {
    const { full_name, student_or_staff_id, email, phone, password } = req.body;

    // Input validation with clear corrective guidance
    if (!full_name || full_name.trim().length < 3) {
      return res.status(400).json({ message: 'Full name is required and must be at least 3 characters long.' });
    }
    if (!student_or_staff_id || student_or_staff_id.trim().length < 4) {
      return res.status(400).json({ message: 'Valid UCU Registration Number (e.g., S24B13/045) is required.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      return res.status(400).json({ message: 'Please enter a valid email address (e.g., name@students.ucu.ac.ug).' });
    }
    if (!phone || phone.trim().length < 9) {
      return res.status(400).json({ message: 'Please provide a valid phone number (at least 9 digits) for admin follow-up.' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long for account security.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanRegNo = student_or_staff_id.trim().toUpperCase();

    // Check duplicates
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR student_or_staff_id = ? LIMIT 1',
      [cleanEmail, cleanRegNo]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        message: 'An account with this email or UCU registration number already exists. Try logging in instead.'
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (full_name, student_or_staff_id, email, phone, password_hash, role)
       VALUES (?, ?, ?, ?, ?, 'student')`,
      [full_name.trim(), cleanRegNo, cleanEmail, phone.trim(), password_hash]
    );

    const user = {
      id: result.insertId,
      full_name: full_name.trim(),
      student_or_staff_id: cleanRegNo,
      email: cleanEmail,
      role: 'student'
    };

    const token = jwt.sign(user, process.env.JWT_SECRET || 'ucu_dev_secret_key', {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    });

    res.status(201).json({
      message: 'Registration successful! Welcome to UCU Lost & Found.',
      token,
      user
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error while creating account. Please try again.' });
  }
});

// POST /api/auth/login - Authenticate student or administrator
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Both email address and password are required to sign in.' });
    }

    const [rows] = await pool.query(
      'SELECT id, full_name, student_or_staff_id, email, phone, password_hash, role FROM users WHERE email = ? LIMIT 1',
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password. Please check your credentials and try again.' });
    }

    const dbUser = rows[0];
    const isMatch = await bcrypt.compare(password, dbUser.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password. Please check your credentials and try again.' });
    }

    const userPayload = {
      id: dbUser.id,
      full_name: dbUser.full_name,
      student_or_staff_id: dbUser.student_or_staff_id,
      email: dbUser.email,
      role: dbUser.role
    };

    const token = jwt.sign(userPayload, process.env.JWT_SECRET || 'ucu_dev_secret_key', {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    });

    res.json({
      message: `Welcome back, ${dbUser.full_name}!`,
      token,
      user: userPayload
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login. Please try again.' });
  }
});

// POST /api/auth/logout - Invalidate active token on the backend
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const expTimestamp = req.user.exp ? new Date(req.user.exp * 1000) : new Date(Date.now() + 8 * 3600 * 1000);
    await pool.query(
      'INSERT INTO token_blacklist (token, expires_at) VALUES (?, ?)',
      [req.token, expTimestamp]
    );
    res.json({ message: 'You have been securely logged out.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Error logging out. Please clear your session and try again.' });
  }
});

// GET /api/auth/me - Get current authenticated user profile
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, full_name, student_or_staff_id, email, phone, role, created_at FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User account not found.' });
    }
    res.json({ user: rows[0] });
  } catch (error) {
    console.error('Fetch me error:', error);
    res.status(500).json({ message: 'Failed to retrieve user profile.' });
  }
});

module.exports = router;
