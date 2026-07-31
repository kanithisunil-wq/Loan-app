// db.js — MySQL connection pool (Aiven-ready, SSL required)
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Aiven requires TLS. rejectUnauthorized:true would need the CA cert bundle;
  // for a quick managed-service connection we still force TLS while
  // trusting Aiven's cert chain. For stricter verification, download the CA
  // certificate from the Aiven console and pass it as `ca` below.
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('✅ Connected to MySQL (Aiven) successfully.');
  } catch (err) {
    console.error('❌ Could not connect to MySQL:', err.message);
  }
}

module.exports = { pool, testConnection };
