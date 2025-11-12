// backend/config/db.js
import mysql from "mysql2";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "12345",
  database: process.env.DB_NAME || "ims_2025",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  // ✅ Important settings for Cloudflare tunnel + Render
  connectTimeout: 20000, // 20 seconds timeout
  enableKeepAlive: true, // keeps the connection alive
  keepAliveInitialDelay: 10000,
  multipleStatements: true,
  family: 4, // ✅ Force IPv4 (fixes ENETUNREACH error)
});

// Test connection immediately
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Database connection failed:", err);
    return;
  }
  console.log("✅ MySQL Connected using Pool...");
  connection.release();
});

export default db;
