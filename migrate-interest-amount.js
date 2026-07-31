// migrate-interest-amount.js
// One-time fix: renames customers.interest_rate (a percentage) to
// customers.interest_amount (a flat currency value added to the total).
//
// Usage: node migrate-interest-amount.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
  });

  try {
    const [[{ dbName }]] = await connection.query('SELECT DATABASE() AS dbName');

    const [existingAmount] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'interest_amount'`,
      [dbName]
    );
    if (existingAmount.length > 0) {
      console.log('✅ customers.interest_amount already exists — nothing to do.');
      return;
    }

    const [existingRate] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'interest_rate'`,
      [dbName]
    );

    if (existingRate.length > 0) {
      console.log('Renaming customers.interest_rate → customers.interest_amount...');
      console.log('Note: any existing values will be kept as-is (previously a %, now treated as a flat amount).');
      await connection.query(
        'ALTER TABLE customers CHANGE COLUMN interest_rate interest_amount DECIMAL(14,2) NOT NULL DEFAULT 0'
      );
    } else {
      console.log('Adding customers.interest_amount column...');
      await connection.query(
        'ALTER TABLE customers ADD COLUMN interest_amount DECIMAL(14,2) NOT NULL DEFAULT 0'
      );
    }

    console.log('✅ Migration complete.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
