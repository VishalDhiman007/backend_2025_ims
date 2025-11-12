import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import productsRoutes from "./routes/products.js";
import valuationRoutes from "./routes/valuation.js";
import employeeRoutes from "./routes/employees.js"; 
import categoryRoutes from "./routes/categoryRoutes.js";
import salesRoutes from "./routes/sales.js";
import zohoRoutes from "./routes/zohoRoutes.js";
import employeeAssignmentsRouter from "./routes/employeeAssignments.js";
import scanRouter from "./routes/scan.js";

const app = express();

// __dirname fix for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(bodyParser.json());

// Make uploads folder public
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productsRoutes);
app.use("/api", valuationRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/zoho", zohoRoutes);
app.use("/api/assignments", employeeAssignmentsRouter);
app.use("/api/scan", scanRouter);

// Test route
app.get("/api/test", (req, res) => {
  res.status(200).json({ message: "Test route working" });
});
// DB connection check endpoint
app.get("/api/dbcheck", (req, res) => {
  db.query("SELECT NOW() AS now", (err, result) => {
    if (err) {
      console.error("DB connection failed:", err);
      return res.status(500).json({ connected: false, error: err });
    }
    res.json({ connected: true, now: result[0].now });
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Server is running" });
});

// ✅ Serve React frontend build (IMPORTANT: note the "../")
// app.use(express.static(path.join(__dirname, "../frontend/dist"))); 

// ✅ Fallback route for React Router
// app.use((req, res) => {
//     res.sendFile(path.join(__dirname, "../frontend/dist", "index.html"));

// });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
