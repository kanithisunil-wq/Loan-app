// migrate-add-ownership.js
// One-time fix for databases created before per-user data isolation existed.
// Adds a user_id column to customers, assigns any existing orphan customers
// to the earliest-registered user, then enforces the constraint.
//
// Usage: node migrate-add-ownership.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
  });

  try {
    const [[{ dbName }]] = await connection.query('SELECT DATABASE() AS dbName');

    const [cols] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'user_id'`,
      [dbName]
    );

    if (cols.length > 0) {
      console.log('✅ customers.user_id already exists — nothing to do.');
      return;
    }

    console.log('Adding user_id column to customers...');
    await connection.query('ALTER TABLE customers ADD COLUMN user_id INT NULL AFTER id');

    const [[firstUser]] = await connection.query('SELECT id, name FROM users ORDER BY id ASC LIMIT 1');
    if (!firstUser) {
      throw new Error('No users found. Register at least one user before running this migration.');
    }

    console.log(`Assigning existing customers with no owner to "${firstUser.name}" (user id ${firstUser.id})...`);
    const [result] = await connection.query(
      'UPDATE customers SET user_id = ? WHERE user_id IS NULL',
      [firstUser.id]
    );
    console.log(`Backfilled ${result.affectedRows} customer row(s).`);

    console.log('Enforcing NOT NULL + foreign key + index...');
    await connection.query('ALTER TABLE customers MODIFY user_id INT NOT NULL');
    await connection.query(
      'ALTER TABLE customers ADD CONSTRAINT fk_customers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
    );
    await connection.query('ALTER TABLE customers ADD INDEX idx_customer_user (user_id)');

    console.log('✅ Migration complete. Every customer now belongs to a specific user.');
    console.log('   If customers were meant to be split across different users rather than');
    console.log('   all owned by the first user, update customers.user_id manually for those rows.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
