-- Finance Loan Management App — MySQL schema (Aiven-compatible)
-- Run once against your defaultdb database, e.g.:
--   mysql --host=<host> --port=<port> --user=avnadmin -p --ssl-mode=REQUIRED defaultdb < schema.sql

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  aadhar_number VARCHAR(20) NOT NULL,
  loan_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  interest_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
  address TEXT,
  customer_photo_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_name (name),
  INDEX idx_customer_phone (phone),
  INDEX idx_customer_aadhar (aadhar_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  photo_url VARCHAR(500) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  type ENUM('ADD','MINUS') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(500),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  INDEX idx_txn_customer (customer_id),
  INDEX idx_txn_date (transaction_date)
) ENGINE=InnoDB;
