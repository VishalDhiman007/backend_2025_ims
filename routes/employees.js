// backend/routes/employees.js
import express from "express";
import multer from "multer";
import path from "path";
import db from "../config/db.js"; 

const router = express.Router();

// File upload setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "_" + file.originalname);
  },
});
const upload = multer({ storage });

// Function to generate emp_id
const generateEmpId = (callback) => {
  db.query("SELECT emp_id FROM employees ORDER BY emp_id DESC LIMIT 1", (err, result) => {
    if (err) return callback(err, null);

    if (result.length === 0) {
      return callback(null, "ELS-001");
    }

    let lastId = result[0].emp_id; // e.g., ELS-005
    let num = parseInt(lastId.split("-")[1]); // 5
    let newId = "ELS-" + String(num + 1).padStart(3, "0"); // ELS-006
    callback(null, newId);
  });
};

// Add employee
router.post("/add", upload.single("emp_image"), (req, res) => {
  const {
    emp_name,
    emp_department,
    emp_designation,
    emp_mobile,
    emp_email,
    emp_doj,
    emp_pass,
  } = req.body;

  const emp_image = req.file ? req.file.filename : null;

  generateEmpId((err, newEmpId) => {
    if (err) return res.status(500).json({ message: err.message });

    const sql = `INSERT INTO employees 
      (emp_id, emp_name, emp_department, emp_designation, emp_mobile, emp_email, emp_doj, emp_pass, emp_image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(
      sql,
      [
        newEmpId,
        emp_name,
        emp_department,
        emp_designation,
        emp_mobile,
        emp_email,
        emp_doj,
        emp_pass,
        emp_image,
      ],
      (err, result) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json({ message: "Employee added successfully", emp_id: newEmpId });
      }
    );
  });
});

// Get all employees
router.get("/all", (req, res) => {
  db.query("SELECT * FROM employees", (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(results);
  });
});

export default router;
