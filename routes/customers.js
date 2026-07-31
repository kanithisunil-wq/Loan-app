// routes/customers.js
const express = require('express');
const path = require('path');
const multer = require('multer');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// --- file upload config (photos saved to /uploads, served statically) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `photo_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  }
});

// POST /api/customers/upload — generic photo upload helper, returns a URL
router.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// GET /api/customers?search=term — list with net balance, optional search
router.get('/', async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    let sql = `
      SELECT c.id, c.name, c.phone, c.aadhar_number, c.loan_amount, c.interest_amount,
             c.customer_photo_url, c.created_at,
             c.interest_amount
             + IFNULL(SUM(CASE WHEN t.type = 'ADD' THEN t.amount ELSE 0 END), 0)
             - IFNULL(SUM(CASE WHEN t.type = 'MINUS' THEN t.amount ELSE 0 END), 0) AS total_amount
      FROM customers c
      LEFT JOIN transactions t ON t.customer_id = c.id
      WHERE c.user_id = ?
    `;
    const params = [req.user.id];
    if (search) {
      sql += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.aadhar_number LIKE ?) ';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' GROUP BY c.id ORDER BY c.created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load customers.' });
  }
});

// POST /api/customers — create customer (+ optional additional photos)
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      name, phone, aadhar_number, loan_amount, interest_amount,
      address, customer_photo_url, additional_photos
    } = req.body;

    if (!name || !phone || !aadhar_number) {
      return res.status(400).json({ error: 'name, phone and aadhar_number are required.' });
    }

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO customers (user_id, name, phone, aadhar_number, loan_amount, interest_amount, address, customer_photo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, phone, aadhar_number, loan_amount || 0, interest_amount || 0, address || null, customer_photo_url || null]
    );
    const customerId = result.insertId;

    // Seed the ledger with the initial loan as an ADD transaction
    if (Number(loan_amount) > 0) {
      await conn.query(
        `INSERT INTO transactions (customer_id, type, amount, notes) VALUES (?, 'ADD', ?, 'Initial loan amount')`,
        [customerId, loan_amount]
      );
    }

    if (Array.isArray(additional_photos)) {
      for (const url of additional_photos) {
        if (url) {
          await conn.query(
            'INSERT INTO customer_photos (customer_id, photo_url) VALUES (?, ?)',
            [customerId, url]
          );
        }
      }
    }

    await conn.commit();
    res.status(201).json({ id: customerId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to create customer.' });
  } finally {
    conn.release();
  }
});

// GET /api/customers/:id — full profile + photos + balance
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [[customer]] = await pool.query('SELECT * FROM customers WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const [photos] = await pool.query(
      'SELECT id, photo_url, uploaded_at FROM customer_photos WHERE customer_id = ? ORDER BY uploaded_at DESC',
      [id]
    );

    const [[balanceRow]] = await pool.query(
      `SELECT
         IFNULL(SUM(CASE WHEN type = 'ADD' THEN amount ELSE 0 END), 0) AS total_added,
         IFNULL(SUM(CASE WHEN type = 'MINUS' THEN amount ELSE 0 END), 0) AS total_deducted
       FROM transactions WHERE customer_id = ?`,
      [id]
    );

    res.json({
      ...customer,
      photos,
      total_amount: Number(customer.interest_amount) + Number(balanceRow.total_added) - Number(balanceRow.total_deducted)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load customer.' });
  }
});

// POST /api/customers/:id/photos — append a supporting document/photo
router.post('/:id/photos', async (req, res) => {
  try {
    const { id } = req.params;
    const { photo_url } = req.body;
    if (!photo_url) return res.status(400).json({ error: 'photo_url is required.' });

    const [[customer]] = await pool.query('SELECT id FROM customers WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const [result] = await pool.query(
      'INSERT INTO customer_photos (customer_id, photo_url) VALUES (?, ?)',
      [id, photo_url]
    );
    res.status(201).json({ id: result.insertId, photo_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add photo.' });
  }
});

// DELETE /api/customers — bulk delete, body: { ids: [1,2,3] }
router.delete('/', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required.' });
    }
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await pool.query(
      `DELETE FROM customers WHERE id IN (${placeholders}) AND user_id = ?`,
      [...ids, req.user.id]
    );
    res.json({ deleted: result.affectedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete customers.' });
  }
});

module.exports = router;
