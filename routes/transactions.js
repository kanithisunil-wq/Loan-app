// routes/transactions.js
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/transactions/customer/:customerId — full ledger for one customer
router.get('/customer/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const [[customer]] = await pool.query('SELECT * FROM customers WHERE id = ? AND user_id = ?', [customerId, req.user.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const [rows] = await pool.query(
      'SELECT id, type, amount, transaction_date, notes FROM transactions WHERE customer_id = ? ORDER BY transaction_date DESC',
      [customerId]
    );

    const totalAdded = rows.filter(r => r.type === 'ADD').reduce((s, r) => s + Number(r.amount), 0);
    const totalDeducted = rows.filter(r => r.type === 'MINUS').reduce((s, r) => s + Number(r.amount), 0);

    res.json({
      customer,
      transactions: rows,
      balance: Number(customer.interest_amount) + totalAdded - totalDeducted
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transactions.' });
  }
});

// POST /api/transactions — add ADD or MINUS transaction
// body: { customer_id, type: 'ADD'|'MINUS', amount, notes }
router.post('/', async (req, res) => {
  try {
    const { customer_id, type, amount, notes } = req.body;
    if (!customer_id || !['ADD', 'MINUS'].includes(type) || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'customer_id, valid type (ADD/MINUS) and a positive amount are required.' });
    }

    const [[customer]] = await pool.query('SELECT id FROM customers WHERE id = ? AND user_id = ?', [customer_id, req.user.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const [result] = await pool.query(
      'INSERT INTO transactions (customer_id, type, amount, notes) VALUES (?, ?, ?, ?)',
      [customer_id, type, amount, notes || null]
    );

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record transaction.' });
  }
});

// GET /api/transactions/by-date?date=YYYY-MM-DD — all transactions across customers for a day
router.get('/by-date', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query param (YYYY-MM-DD) is required.' });

    const [rows] = await pool.query(
      `SELECT t.id, t.type, t.amount, t.transaction_date, t.notes,
              c.id AS customer_id, c.name AS customer_name
       FROM transactions t
       JOIN customers c ON c.id = t.customer_id
       WHERE DATE(t.transaction_date) = ? AND c.user_id = ?
       ORDER BY t.transaction_date DESC`,
      [date, req.user.id]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transactions for date.' });
  }
});

// GET /api/transactions/dates-with-activity?month=YYYY-MM — for calendar highlighting
router.get('/dates-with-activity', async (req, res) => {
  try {
    const { month } = req.query; // YYYY-MM
    if (!month) return res.status(400).json({ error: 'month query param (YYYY-MM) is required.' });

    const [rows] = await pool.query(
      `SELECT DISTINCT DATE(t.transaction_date) AS day
       FROM transactions t
       JOIN customers c ON c.id = t.customer_id
       WHERE DATE_FORMAT(t.transaction_date, '%Y-%m') = ? AND c.user_id = ?`,
      [month, req.user.id]
    );
    res.json(rows.map(r => r.day));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load activity dates.' });
  }
});

module.exports = router;
