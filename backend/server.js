const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const claimRoutes = require('./routes/claims');
const adminRoutes = require('./routes/admin');
const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded item images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'UCU Campus Lost and Found API', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/admin', adminRoutes);

// Multer & global error handler
app.use((err, req, res, next) => {
  if (err && err.message) {
    return res.status(400).json({ message: err.message });
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ message: 'An unexpected server error occurred.' });
});

async function startServer() {
  try {
    await pool.query('SELECT 1');

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || adminPassword.length < 12) {
      throw new Error('ADMIN_PASSWORD must be set to at least 12 characters in backend/.env.');
    }

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@ucu.ac.ug').trim().toLowerCase();
    if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      throw new Error('ADMIN_EMAIL must be a valid email address in backend/.env.');
    }
    const [existingAdmins] = await pool.query(
      'SELECT id, role FROM users WHERE email = ? LIMIT 1',
      [adminEmail]
    );
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    if (existingAdmins.length > 0) {
      if (existingAdmins[0].role !== 'admin') {
        throw new Error(`ADMIN_EMAIL ${adminEmail} belongs to a non-administrator account.`);
      }

      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [
        passwordHash,
        existingAdmins[0].id
      ]);
    } else {
      await pool.query(
        `INSERT INTO users
         (full_name, student_or_staff_id, email, phone, password_hash, role)
         VALUES ('UCU Lost & Found Administrator', 'UCU-ADMIN-001', ?, 'N/A', ?, 'admin')`,
        [adminEmail, passwordHash]
      );
    }
  } catch (error) {
    console.error('Unable to start backend:', error.code || error.message);

    if (error.message && error.message.startsWith('ADMIN_PASSWORD')) {
      console.error(error.message);
    } else if (error.message && error.message.startsWith('ADMIN_EMAIL')) {
      console.error(error.message);
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(
        'Set DB_USER and DB_PASSWORD in backend/.env to credentials that can access MySQL.'
      );
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error(
        'Database ucu_lost_and_found does not exist. Run backend/database/schema.sql.'
      );
    } else {
      console.error('Check DB_HOST and DB_PORT in backend/.env and ensure MySQL is running.');
    }

    process.exitCode = 1;
    return;
  }

  app.listen(PORT, () => {
    console.log(`UCU Lost & Found API server running on http://localhost:${PORT}`);
  });
}

startServer();
