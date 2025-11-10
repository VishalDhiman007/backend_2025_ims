// routes/scan.js
import express from "express";
import db from "../config/db.js";

const router = express.Router();

/* =========================================================
   🧠 Helper Functions
========================================================= */
function getScannedBy(req) {
  try {
    if (!req || !req.user) return 0;
    if (typeof req.user.id === "number") return req.user.id;
    if (typeof req.user.id === "string") return parseInt(req.user.id, 10) || 0;
    if (req.user.id && typeof req.user.id === "object") {
      return parseInt(req.user.id.id, 10) || 0;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

async function safeRelease(conn) {
  try {
    if (conn) await conn.release();
  } catch (e) {
    // ignore safely
  }
}

/* =========================================================
   📤 1️⃣ SCAN OUT  → /api/scan/out
========================================================= */
router.post("/out", async (req, res) => {
  const { unique_id } = req.body;
  if (!unique_id)
    return res.status(400).json({ message: "unique_id is required" });

  let conn;
  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT * FROM products WHERE unique_id = ? FOR UPDATE",
      [unique_id]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Product not found" });
    }

    const product = rows[0];

    if (!product.qty || Number(product.qty) <= 0) {
      await conn.rollback();
      return res.status(400).json({ message: "No stock available to OUT" });
    }

    const newQty = Number(product.qty) - 1;
    const newStatus = newQty > 0 ? "AVAILABLE" : "OUT OF STOCK";

    await conn.query(
      "UPDATE products SET qty = ?, stock_status = ?, updated_at = NOW() WHERE id = ?",
      [newQty, newStatus, product.id]
    );

    const scanned_by = getScannedBy(req);
    await conn.query(
      `INSERT INTO product_in_out_history
       (product_id, unique_id, name, model, serialNo, qty, rate, status, photo, scanned_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OUT', ?, ?, NOW())`,
      [
        product.id,
        product.unique_id,
        product.name || null,
        product.model || null,
        product.serialNo || null,
        1,
        product.rate || 0,
        product.photo || null,
        scanned_by,
      ]
    );

    await conn.commit();
    await safeRelease(conn);

    return res.json({
      message: "✅ Product OUT successfully",
      product: { unique_id: product.unique_id, qty: newQty, stock_status: newStatus },
    });
  } catch (err) {
    console.error("❌ Scan OUT error:", err);
    if (conn) await conn.rollback().catch(() => {});
    await safeRelease(conn);
    return res.status(500).json({ message: "Server error" });
  }
});

/* =========================================================
   📥 2️⃣ SCAN IN  → /api/scan/in
========================================================= */
router.post("/in", async (req, res) => {
  const { unique_id } = req.body;
  if (!unique_id)
    return res.status(400).json({ message: "unique_id is required" });

  let conn;
  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT * FROM products WHERE unique_id = ? FOR UPDATE",
      [unique_id]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Product not found" });
    }

    const product = rows[0];
    const newQty = (Number(product.qty) || 0) + 1;

    await conn.query(
      "UPDATE products SET qty = ?, stock_status = 'AVAILABLE', updated_at = NOW() WHERE id = ?",
      [newQty, product.id]
    );

    const scanned_by = getScannedBy(req);
    await conn.query(
      `INSERT INTO product_in_out_history
       (product_id, unique_id, name, model, serialNo, qty, rate, status, photo, scanned_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'IN', ?, ?, NOW())`,
      [
        product.id,
        product.unique_id,
        product.name || null,
        product.model || null,
        product.serialNo || null,
        1,
        product.rate || 0,
        product.photo || null,
        scanned_by,
      ]
    );

    await conn.commit();
    await safeRelease(conn);

    return res.json({
      message: "✅ Product IN successfully",
      product: { unique_id: product.unique_id, qty: newQty, stock_status: "AVAILABLE" },
    });
  } catch (err) {
    console.error("❌ Scan IN error:", err);
    if (conn) await conn.rollback().catch(() => {});
    await safeRelease(conn);
    return res.status(500).json({ message: "Server error" });
  }
});

/* =========================================================
   📜 3️⃣ FETCH ALL IN/OUT HISTORY → /api/scan/inout-history
========================================================= */
router.get("/inout-history", (req, res) => {
  const query = `
    SELECT 
      h.id,
      h.unique_id,
      h.name,
      h.model,
      h.serialNo,
      h.qty,
      h.rate,
      h.status,
      h.photo,
      h.scanned_by,
      h.created_at,
      p.name AS product_name
    FROM product_in_out_history h
    LEFT JOIN products p ON h.product_id = p.id
    ORDER BY h.created_at DESC;
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("❌ Error fetching In/Out history:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

/* =========================================================
   ➕ 4️⃣ ADD MANUAL IN/OUT RECORD → /api/scan/inout-history
========================================================= */
router.post("/inout-history", (req, res) => {
  const { product_id, unique_id, name, model, serialNo, qty, rate, status, photo, scanned_by } =
    req.body;

  if (!product_id || !status || !unique_id || !scanned_by) {
    return res.status(400).json({ error: "Missing required fields!" });
  }

  const query = `
    INSERT INTO product_in_out_history 
      (product_id, unique_id, name, model, serialNo, qty, rate, status, photo, scanned_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  db.query(
    query,
    [product_id, unique_id, name, model, serialNo, qty || 1, rate || 0, status, photo || null, scanned_by],
    (err, result) => {
      if (err) {
        console.error("❌ Error adding manual record:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({ message: "✅ In/Out record added successfully!", id: result.insertId });
    }
  );
});

/* =========================================================
   🗑️ 5️⃣ DELETE A RECORD → /api/scan/inout-history/:id
========================================================= */
router.delete("/inout-history/:id", (req, res) => {
  const { id } = req.params;

  const query = `DELETE FROM product_in_out_history WHERE id = ?`;
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("❌ Error deleting record:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });

    res.json({ message: "🗑️ Record deleted successfully!" });
  });
});

export default router;
