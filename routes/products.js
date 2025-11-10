import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import db from "../config/db.js";
import protect from "../middleware/authMiddleware.js"; 
import archiver from "archiver";

const router = express.Router();
//====================================
//       upload directories 
//====================================
const uploadDir = "uploads/";
const qrDir = "uploads/qr/";

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir);

//==============================================
//------------------ Multer setup---------------
//==============================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

//===========================================================
// --------------Serve uploads folder globally---------------
//===========================================================
router.use("/uploads", express.static("uploads"));

// -------------------- GET all products filltered by cate. + subcate. --------------------

router.get("/", (req, res) => {
  const { category_id, subcategory_id } = req.query;
   let sql = `
    SELECT p.*, s.name AS subcategory_name, c.name AS category_name,
       CASE WHEN EXISTS (
         SELECT 1 
         FROM employee_products ep 
         WHERE ep.product_id = p.id AND ep.is_active = 1
       ) THEN 1 ELSE 0 END AS isAssigned
FROM products p
LEFT JOIN subcategories s ON p.subcategory_id = s.id
LEFT JOIN categories c ON p.category_id = c.id
  `;
  const params = [];

  if (category_id && subcategory_id) {
    sql += " WHERE p.category_id = ? AND p.subcategory_id = ?";
    params.push(category_id, subcategory_id);
  } else if (category_id) {
    sql += " WHERE p.category_id = ?";
    params.push(category_id);
  }

  sql += " ORDER BY p.created_at DESC";

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ message: "❌ Error fetching products", err });

    const productsWithStatus = results.map((p) => ({
      ...p,
       subcategoryName: p.subcategory_name,
  categoryName: p.category_name,
      status: p.qty > 0 ? "new" : "used",
      photoURL: p.photo ? `/uploads/${p.photo}` : null,
      qrURL: p.qr_code ? `/${p.qr_code}` : null,
      isAssigned: p.isAssigned === 1,
    }));

    res.json(productsWithStatus);
  });
});



// -------------------- GET product by unique ID --------------------
 
router.get("/:uniqueId", (req, res) => {
  const { uniqueId } = req.params;
  const sql = "SELECT * FROM products WHERE unique_id = ?";
  db.query(sql, [uniqueId], (err, results) => {
    if (err) return res.status(500).json({ message: "❌ DB Error" });
    if (results.length === 0) return res.status(404).json({ message: "Product not found" });

    const product = {
      ...results[0],
      status: results[0].qty > 0 ? "new" : "used",
      photoURL: results[0].photo ? `/uploads/${results[0].photo}` : null,
      qrURL: results[0].qr_code ? `/${results[0].qr_code}` : null,
    };

    res.json(product);
  });
});

// -------------------- Add product route --------------------
router.post("/add", protect, upload.single("photo"), async (req, res) => {
  try {
    const { name, model, qty, rate,sales_rate, categoryId, subcategoryId, serialNumbers, location } = req.body;

    if (!name || !model || !categoryId || !subcategoryId) {
      return res.status(400).json({ message: "⚠️ Missing required fields" });
    }

    const parsedRate = rate && rate !== "" ? parseFloat(rate) : 0.0;
    const photo = req.file ? req.file.filename : null;

    // Serial numbers: always array
    let serials = [];
    if (serialNumbers) {
      try {
        serials = Array.isArray(JSON.parse(serialNumbers))
          ? JSON.parse(serialNumbers)
          : [JSON.parse(serialNumbers)];
      } catch (err) {
        serials = [serialNumbers];
      }
    }

   const quantity = Math.min(parseInt(qty) || 1, 100); // Max 100


    // Agar serials array choti ho to fill nulls
    if (serials.length < quantity) {
      for (let i = serials.length; i < quantity; i++) serials.push(null);
    }

    const products = [];

    // ✅ Ab single ya multiple product dono ke liye same loop
    for (let i = 0; i < quantity; i++) {
      const uniqueId = uuidv4();
      const qrFileName = `${uniqueId}.png`;
      const qrFilePath = path.join(qrDir, qrFileName);
      await QRCode.toFile(qrFilePath, uniqueId);

     const sql = `
  INSERT INTO products
  (name, model, qty, rate, sales_rate, photo, unique_id, qr_code, category_id, subcategory_id, serialNo, location)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;


      const serialNo = serials[i] || null;

      await new Promise((resolve, reject) => {
        db.query(
          sql,
          [name, model, 1, parsedRate,parseFloat(sales_rate) || 0, photo, uniqueId, qrFilePath, categoryId, subcategoryId, serialNo, location],
          (err, result) => {
            if (err) return reject(err);

            products.push({
              id: result.insertId,
              name,
              model,
              qty: 1,
              rate: parsedRate,
              sales_rate: parseFloat(sales_rate) || 0,
              photoURL: photo ? `/uploads/${photo}` : null,
              uniqueId,
              serialNo,
              qrURL: `/uploads/qr/${qrFileName}`,
              categoryId,
              subcategoryId,
            });

            resolve();
          }
        );
      });
    }

//======================================================== 
//----------- history one entry for each batch -----------
//======================================================== 


   const userId = req.user?.id?.id || req.user?.id;
products.forEach(p => {
  db.query(
    "INSERT INTO product_history (product_name, action, user_id, unique_id, serialNo, photo) VALUES (?, 'added', ?, ?, ?, ?)",
    [p.name, userId, p.uniqueId, p.serialNo, photo],
    () => {}
  );
});
    res.json({
      message: `✅ ${quantity > 1 ? "Multiple products" : "Product"} added successfully`,
      products
      // qrUrl: products[0]?.qrURL|| null
    });
  } catch (err) {
    console.error("❌ Server Error:", err);
    res.status(500).json({ message: "❌ Server Error" });
  }
});


// -------------------- Delete product by unique ID --------------------
router.delete("/:uniqueId", protect, async (req, res) => {
  try {
    const uniqueId = req.params.uniqueId;
    const userId = req.user.id;

    // 1️⃣ Get product details
    const [rows] = await db
      .promise()
      .query("SELECT id, name, photo, serialNo, unique_id, qr_code FROM products WHERE unique_id = ?", [uniqueId]);

    if (!rows.length) {
      return res.status(404).json({ message: "❌ Product not found" });
    }

    const product = rows[0];

    // 2️⃣ Delete from employee_products first (avoid foreign key error)
    await db.promise().query("DELETE FROM employee_products WHERE product_id = ?", [product.id]);

    // 3️⃣ Delete product itself
    await db.promise().query("DELETE FROM products WHERE id = ?", [product.id]);

    // 4️⃣ Remove photo and QR files if exist
    if (product.photo) {
      const photoPath = path.join("uploads", product.photo);
      if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
    }
    if (product.qr_code) {
      const qrPath = path.join(product.qr_code);
      if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
    }

    // 5️⃣ Log the delete action
    await db.promise().query(
      `INSERT INTO product_history 
       (product_name, action, user_id, unique_id, serialNo, photo) 
       VALUES (?, 'deleted', ?, ?, ?, ?)`,
      [product.name, userId, product.unique_id, product.serialNo, product.photo]
    );

    // ✅ Final response
    res.json({ message: "✅ Product deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Error:", err);
    res.status(500).json({ message: "❌ Error deleting product", error: err });
  }
});

// -------------------- Edit/Update product by unique ID --------------------
router.put("/:uniqueId", protect, upload.single("photo"), (req, res) => {
 const { name, model, qty, rate, sales_rate, serialNo, location } = req.body;
   const photo = req.file ? req.file.filename : null;

  // Convert qty and rate to proper types
  const parsedQty = qty ? parseInt(qty) : undefined;
  const parsedRate = rate ? parseFloat(rate) : undefined;

  const fields = [];
  const params = [];

  if (name !== undefined) { fields.push("name=?"); params.push(name); }
  if (model !== undefined) { fields.push("model=?"); params.push(model); }
  if (parsedQty !== undefined) { fields.push("qty=?"); params.push(parsedQty); }
  if (parsedRate !== undefined) { fields.push("rate=?"); params.push(parsedRate); }
  if (sales_rate !== undefined) { fields.push("sales_rate=?"); params.push(parseFloat(sales_rate)); }
  if (serialNo !== undefined) { fields.push("serialNo=?"); params.push(serialNo); }
  if (location !== undefined) { fields.push("location=?"); params.push(location); }
  if (photo) { fields.push("photo=?"); params.push(photo); }

  if (fields.length === 0) return res.status(400).json({ message: "⚠️ No fields to update" });

  const sql = `UPDATE products SET ${fields.join(", ")} WHERE unique_id=?`;
  params.push(req.params.uniqueId);

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("❌ Error updating product:", err);
      return res.status(500).json({ message: "❌ Error updating product", error: err });
    }

    const userId = req.user.id;

    db.query(
      "INSERT INTO product_history (product_name, action, user_id, unique_id, serialNo, photo) VALUES (?, 'edited', ?, ?, ?, ?)",
      [name || "", userId, req.params.uniqueId, serialNo || "", photo || null],
      (err) => {
        if (err) console.error("❌ History logging error:", err);
      }
    );

    const updatedProduct = {
      unique_id: req.params.uniqueId,
      name,
      model,
      qty: parsedQty,
      rate: parsedRate,
      serialNo,
      location,
      photoURL: photo ? `/uploads/${photo}` : undefined,
    };

    res.json({ message: "✅ Product updated successfully", product: updatedProduct });
  });
});



//======================================================== 
// ---- Get product history with user email + role --------
//======================================================== 

router.get("/history/all", (req, res) => {
  const sql = `
    SELECT ph.id, ph.product_name, ph.action, ph.timestamp,
           ph.user_id, u.email AS email, u.role AS role,
           ph.unique_id, ph.serialNo, ph.photo
    FROM product_history ph
    LEFT JOIN users u ON ph.user_id = u.id
    ORDER BY ph.timestamp DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Error fetching history:", err);
      return res.status(500).json({ message: "❌ Error fetching history" });
    }

    const dataWithPhotoURL = results.map(r => ({
      ...r,
      photoURL: r.photo ? `/uploads/${r.photo}` : null,
    }));

    res.json(dataWithPhotoURL);
  });
});

// -------------- Get today's products---------------

router.get("/today", (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // today 00:00:00
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1); // tomorrow 00:00:00

  const query = `
    SELECT id, name, model, qty, rate, sales_rate, photo, created_at
    FROM products
    WHERE created_at >= ? AND created_at < ?
    ORDER BY created_at DESC
  `;

  db.query(query, [today, tomorrow], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });
    res.json(results);
  });
});


export default router;
