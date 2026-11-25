const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Extract Bearer token safely
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.split(' ')[1];
}

// Optional auth: attaches req.user if valid token exists, otherwise continues as guest
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const [blacklisted] = await pool.query(
      'SELECT id FROM token_blacklist WHERE token = ? LIMIT 1',
      [token]
    );
    if (blacklisted.length > 0) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ucu_dev_secret_key');
    req.user = decoded;
    req.token = token;
  } catch (err) {
    req.user = null;
  }
  next();
}

// Strict authentication middleware
async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Authentication required. Please log in to continue.' });
  }

  try {
    const [blacklisted] = await pool.query(
      'SELECT id FROM token_blacklist WHERE token = ? LIMIT 1',
      [token]
    );
    if (blacklisted.length > 0) {
      return res.status(401).json({ message: 'Your session has ended. Please log in again.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ucu_dev_secret_key');
    req.user = decoded;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired session token. Please log in again.' });
  }
}

// Role-based access control for Administrators
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      message: 'Access denied. Administrator privileges are required for this action.'
    });
  }
  next();
}

module.exports = {
  extractToken,
  optionalAuth,
  requireAuth,
  requireAdmin
};
