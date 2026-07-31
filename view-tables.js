// view-tables.js — quick CLI viewer for the users and customers tables
// Usage: node view-tables.js
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
    const [users] = await connection.query(
      'SELECT id, name, email, created_at FROM users'
    );
    console.log('\n=== USERS ===');
    console.table(users);

    const [customers] = await connection.query(
      `SELECT c.id, c.user_id, u.name AS owner, c.name, c.phone, c.aadhar_number,
              c.loan_amount, c.interest_rate, c.address, c.created_at
       FROM customers c JOIN users u ON u.id = c.user_id
       ORDER BY c.user_id, c.id`
    );
    console.log('\n=== CUSTOMERS ===');
    console.table(customers);
  } catch (err) {
    console.error('❌ Failed to read tables:', err.message);
  } finally {
    await connection.end();
  }
}

main();
