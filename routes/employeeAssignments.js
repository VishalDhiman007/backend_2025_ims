// routes/employeeAssignments.js
import express from "express";
import db from "../config/db.js"; // your mysql pool/promise wrapper
const router = express.Router();

// 1) GET all employees
router.get("/employees", async (req, res) => {
  try {
    const [rows] = await db.promise().query("SELECT emp_id, emp_name, emp_department, emp_designation, emp_email, emp_mobile, emp_image FROM employees");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching employees" });
  }
});

// 2) GET products that are currently AVAILABLE for assignment (not actively assigned)
router.get("/products/available", async (req, res) => {
  try {
    // products not assigned in employee_products where is_active = 1
 const [rows] = await db.promise().query(`
      SELECT p.id, p.name, p.model, p.serialNo AS serial_no, p.qty, p.rate, p.photo, p.unique_id
      FROM products p
      LEFT JOIN employee_products ep ON p.id = ep.product_id AND ep.is_active = 1
      WHERE ep.id IS NULL
      ORDER BY p.name
    `);
    
   // Optional: generate frontend-friendly photoURL
    const products = rows.map(p => ({
      ...p,
      photoURL: p.photo ? `/uploads/${p.photo}` : null,
      status: p.qty > 0 ? "new" : "used",
    }));

    res.json(products);
  } catch (err) {
    console.error("Error fetching available products:", err);
    res.status(500).json({ message: "Error fetching products" });
  }
});

// 3) Assign product to employee
router.post("/assign", async (req, res) => {
  try {
    const { productId, empId } = req.body;
    if (!productId || !empId) return res.status(400).json({ message: "productId and empId required" });

    // check already assigned
    const [[active]] = await db.promise().query("SELECT * FROM employee_products WHERE product_id = ? AND is_active = 1", [productId]);
    if (active) return res.status(400).json({ message: "Product already assigned" });

    // insert assignment
    await db.promise().query("INSERT INTO employee_products (emp_id, product_id) VALUES (?, ?)", [empId, productId]);

    // optionally increment reserved_qty (if you use reserved_qty) — safe to attempt:
    await db.promise().query("UPDATE products SET reserved_qty = COALESCE(reserved_qty,0) + 1 WHERE id = ?", [productId]);

    res.json({ message: "Assigned successfully" });
  } catch (err) {
    console.error("Assign error:", err);
    res.status(500).json({ message: "Error assigning product" });
  }  
});

// 4) GET products assigned to a single employee (active ones)
router.get("/employee/:empId/products", async (req, res) => {
  try {
    const empId = req.params.empId;
    const [rows] = await db.promise().query(`
      SELECT p.id, p.name, p.model, p.serialNo AS serial_no, ep.assigned_at, ep.released_at, ep.is_active, ep.id AS assignment_id
      FROM employee_products ep
      JOIN products p ON ep.product_id = p.id
      WHERE ep.emp_id = ? 
      ORDER BY ep.assigned_at DESC
    `, [empId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching assigned products" });
  }
});

// 5) Release / unassign product (mark assignment inactive)
router.put("/unassign/:assignmentId", async (req, res) => {
  try {
    const assignmentId = req.params.assignmentId;
    // find product id for reserved_qty decrement
    const [[assignment]] = await db.promise().query("SELECT * FROM employee_products WHERE id = ?", [assignmentId]);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    await db.promise().query("UPDATE employee_products SET is_active = 0, released_at = NOW() WHERE id = ?", [assignmentId]);
    // decrement reserved_qty safely
    await db.promise().query("UPDATE products SET reserved_qty = GREATEST(COALESCE(reserved_qty,0) - 1, 0) WHERE id = ?", [assignment.product_id]);

    res.json({ message: "Unassigned successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error unassigning" });
  }
});
router.get("/assignments/products", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT ep.id AS assignment_id, p.name, p.model, p.serialNo AS serial_no,
             ep.assigned_at, ep.emp_id, e.emp_name
      FROM employee_products ep
      JOIN products p ON ep.product_id = p.id
      JOIN employees e ON ep.emp_id = e.emp_id
      WHERE ep.is_active = 1
      ORDER BY ep.assigned_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching assigned products" });
  }
});


export default router;
