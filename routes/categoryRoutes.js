import express from "express";
import db from "../config/db.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// -------------------- Get all categories with subcategories --------------------
router.get("/", (req, res) => {
  const sqlCategories = "SELECT * FROM categories ORDER BY created_at DESC";
  const sqlSubcategories = "SELECT * FROM subcategories ORDER BY created_at DESC";

  db.query(sqlCategories, (err, categories) => {
    if (err) return res.status(500).json({ message: "❌ Error fetching categories", err });

    db.query(sqlSubcategories, (err, subcategories) => {
      if (err) return res.status(500).json({ message: "❌ Error fetching subcategories", err });

      const categoriesWithSubs = categories.map((cat) => ({
        ...cat,
        subcategories: subcategories.filter((sub) => sub.category_id === cat.id),
      }));

      res.json(categoriesWithSubs);
    });
  });
});

// -------------------- Add category --------------------
router.post("/add", protect, (req, res) => {
  const { name } = req.body;
  console.log("Adding category:", name);

  if (!name) return res.status(400).json({ message: "Category name is required" });

  const sql = "INSERT INTO categories (name) VALUES (?)";
  db.query(sql, [name], (err, result) => {
    if (err) return res.status(500).json({ message: "❌ Error adding category", err });

    res.json({ message: "✅ Category added successfully", id: result.insertId });
  });
});

// -------------------- Update category --------------------
router.put("/:id", protect, (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  console.log("Updating category:", id, name);

  if (!name) return res.status(400).json({ message: "Category name is required" });

  const sql = "UPDATE categories SET name = ? WHERE id = ?";
  db.query(sql, [name, id], (err, result) => {
    if (err) return res.status(500).json({ message: "❌ Error updating category", err });
    if (result.affectedRows === 0) return res.status(404).json({ message: "Category not found" });

    res.json({ message: "✅ Category updated successfully" });
  });
});

// -------------------- Delete category --------------------
router.delete("/:id", protect, (req, res) => {
  const { id } = req.params;
  console.log("Deleting category:", id);

  // Delete subcategories first to avoid foreign key issues
  const sqlSub = "DELETE FROM subcategories WHERE category_id = ?";
  db.query(sqlSub, [id], (err, resultSub) => {
    if (err) return res.status(500).json({ message: "❌ Error deleting subcategories", err });

    const sqlCat = "DELETE FROM categories WHERE id = ?";
    db.query(sqlCat, [id], (err, resultCat) => {
      if (err) return res.status(500).json({ message: "❌ Error deleting category", err });
      if (resultCat.affectedRows === 0) return res.status(404).json({ message: "Category not found" });

      res.json({ message: "✅ Category and its subcategories deleted successfully" });
    });
  });
});

// -------------------- Add subcategory --------------------
router.post("/:categoryId/subcategories/add", protect, (req, res) => {
  const { categoryId } = req.params;
  const { name } = req.body;
  console.log("Adding subcategory:", name, "to category:", categoryId);

  if (!name) return res.status(400).json({ message: "Subcategory name is required" });

  const sql = "INSERT INTO subcategories (category_id, name) VALUES (?, ?)";
  db.query(sql, [categoryId, name], (err, result) => {
    if (err) return res.status(500).json({ message: "❌ Error adding subcategory", err });

    res.json({ message: "✅ Subcategory added successfully", id: result.insertId });
  });
});

// -------------------- Update subcategory --------------------
router.put("/:categoryId/subcategories/:subId", protect, (req, res) => {
  const { categoryId, subId } = req.params;
  const { name } = req.body;
  console.log("Updating subcategory:", subId, "of category:", categoryId, "to:", name);

  if (!name) return res.status(400).json({ message: "Subcategory name is required" });

  const sql = "UPDATE subcategories SET name = ? WHERE id = ? AND category_id = ?";
  db.query(sql, [name, subId, categoryId], (err, result) => {
    if (err) return res.status(500).json({ message: "❌ Error updating subcategory", err });
    if (result.affectedRows === 0) return res.status(404).json({ message: "Subcategory not found" });

    res.json({ message: "✅ Subcategory updated successfully" });
  });
});

// -------------------- Delete subcategory safely --------------------
router.delete("/:categoryId/subcategories/:subId", protect, (req, res) => {
  const { categoryId, subId } = req.params;

  // Step 1: Check if any product uses this subcategory
  const checkSql = "SELECT COUNT(*) AS count FROM products WHERE subcategory_id = ?";
  db.query(checkSql, [subId], (err, result) => {
    if (err) return res.status(500).json({ message: "❌ Error checking products", error: err });

    if (result[0].count > 0) {
      return res.status(400).json({
        message: "❌ Cannot delete subcategory. Products exist under this subcategory."
      });
    }

    // Step 2: Delete the subcategory
    const delSql = "DELETE FROM subcategories WHERE id = ? AND category_id = ?";
    db.query(delSql, [subId, categoryId], (err, result) => {
      if (err) return res.status(500).json({ message: "❌ Error deleting subcategory", error: err });
      if (result.affectedRows === 0) return res.status(404).json({ message: "Subcategory not found" });

      res.json({ message: "✅ Subcategory deleted successfully" });
    });
  });
});

// -------------------- Get subcategories by category --------------------

router.get("/:categoryId/subcategories", (req, res) => {
  const { categoryId } = req.params;
  const sql = "SELECT * FROM subcategories WHERE category_id = ? ORDER BY created_at DESC";

  db.query(sql, [categoryId], (err, results) => {
    if (err) return res.status(500).json({ message: "❌ Error fetching subcategories", err });

    res.json(results);
  });
});

export default router;
