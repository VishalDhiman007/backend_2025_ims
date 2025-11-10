// routes/valuation.js
import express from "express";
import db from "../config/db.js";

const router = express.Router();

router.get("/valuation", (req, res) => {
  const sql = `
    SELECT 
      id, 
      name, 
      serialNo, 
      qty, 
      rate, 
      (qty * rate) AS total_value
    FROM products
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Error fetching valuation:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});
router.get("/collection", (req, res) => {
  const sql = `
    SELECT c.name AS category_name, SUM(p.qty * p.rate) AS total_value
    FROM products p
    JOIN categories c ON p.category_id = c.id
    GROUP BY c.id
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});


export default router;
