import db from "../config/db.js";
import generateToken from "../utils/generateToken.js";

// Admin Login
export const adminLogin = (req, res) => {
  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email = ? AND role = 'admin'",
    [email],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Database error" });
      if (result.length === 0)
        return res.status(401).json({ message: "Admin not found" });

      const user = result[0];
      if (user.password !== password)
        return res.status(401).json({ message: "Invalid password" });

      res.json({
        token: generateToken({
          id: user.id,
          role: user.role,
          username: user.username,
          email: user.email,   // ✅ added
        }),
        role: user.role,
        userId: user.id,
        username: user.username,
        email: user.email,
      });
    }
  );
};

// Staff Login
export const staffLogin = (req, res) => {
  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email = ? AND role = 'staff'",
    [email],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Database error" });
      if (result.length === 0)
        return res.status(401).json({ message: "Staff not found" });

      const user = result[0];
      if (user.password !== password)
        return res.status(401).json({ message: "Invalid password" });

      res.json({
        token: generateToken({
          id: user.id,
          role: user.role,
          username: user.username,
          email: user.email,   // ✅ added
        }),
        role: user.role,
        userId: user.id,
        username: user.username,
        email: user.email,
      });
    }
  );
};