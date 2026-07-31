// routes/dashboard.js
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/dashboard — metrics for the User Details / Balance page
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const [[{ total_customers }]] = await pool.query(
      'SELECT COUNT(*) AS total_customers FROM customers WHERE user_id = ?', [userId]
    );
    const [[{ total_loan_amount }]] = await pool.query(
      'SELECT IFNULL(SUM(loan_amount), 0) AS total_loan_amount FROM customers WHERE user_id = ?', [userId]
    );

    const [[{ total_profit }]] = await pool.query(
      'SELECT IFNULL(SUM(interest_amount), 0) AS total_profit FROM customers WHERE user_id = ?', [userId]
    );

    const [[{ total_added }]] = await pool.query(
      `SELECT IFNULL(SUM(t.amount), 0) AS total_added
       FROM transactions t JOIN customers c ON c.id = t.customer_id
       WHERE t.type = 'ADD' AND c.user_id = ?`, [userId]
    );
    const [[{ total_deducted }]] = await pool.query(
      `SELECT IFNULL(SUM(t.amount), 0) AS total_deducted
       FROM transactions t JOIN customers c ON c.id = t.customer_id
       WHERE t.type = 'MINUS' AND c.user_id = ?`, [userId]
    );
    const outstanding = Number(total_added) - Number(total_deducted);

    res.json({
      total_customers,
      total_loan_amount: Number(total_loan_amount),
      total_profit,
      outstanding_balance: outstanding
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard metrics.' });
  }
});

module.exports = router;
