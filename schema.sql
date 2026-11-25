-- UCU Campus Lost and Found System Database Schema
-- Course: CSC1202 Web and Mobile Applications Development

CREATE DATABASE IF NOT EXISTS ucu_lost_and_found
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ucu_lost_and_found;

DROP TABLE IF EXISTS token_blacklist;
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS users;

-- 1. Users Table (Students & Administrators)
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  student_or_staff_id VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Lost & Found Items Table
CREATE TABLE items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reporter_id INT NOT NULL,
  report_type ENUM('LOST', 'FOUND') NOT NULL,
  title VARCHAR(150) NOT NULL,
  category ENUM('Keys & Access Cards', 'Electronics', 'ID Cards & Documents', 'Bags & Clothing', 'Books & Stationery', 'Other') NOT NULL,
  public_description TEXT NOT NULL,
  private_details TEXT NULL COMMENT 'Visible ONLY to reporter and admin for FOUND items',
  campus_location VARCHAR(120) NOT NULL,
  incident_date DATE NOT NULL,
  image_url VARCHAR(255) NULL,
  status ENUM('OPEN', 'RETURNED') NOT NULL DEFAULT 'OPEN',
  returned_at TIMESTAMP NULL,
  confirmed_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_items_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_items_type_status (report_type, status),
  INDEX idx_items_category (category),
  INDEX idx_items_location (campus_location),
  INDEX idx_items_date (incident_date)
) ENGINE=InnoDB;

-- 3. Ownership Claims Table
CREATE TABLE claims (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  claimant_id INT NOT NULL,
  evidence_description TEXT NOT NULL COMMENT 'Private verification details visible only to claimant and admin',
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  admin_notes TEXT NULL,
  collection_instructions VARCHAR(255) NULL,
  reviewed_by INT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_claims_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_claimant FOREIGN KEY (claimant_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_item_claimant (item_id, claimant_id)
) ENGINE=InnoDB;

-- 4. Token Blacklist Table (Ensures logout immediately ends authenticated access)
CREATE TABLE token_blacklist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(512) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token (token(255))
) ENGINE=InnoDB;
