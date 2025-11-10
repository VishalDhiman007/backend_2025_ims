import express from "express";
import axios from "axios";
import querystring from "querystring";
import db from "../config/db.js";
import dotenv from "dotenv";
import { callZohoBooks, getAccessToken } from "../zohoHelper.js";

dotenv.config();
const router = express.Router();

const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REDIRECT_URI,
  ZOHO_AUTH_URL
} = process.env;

// =======================
// 1️⃣ Zoho Login (force refresh_token)
// =======================
router.get("/login", (req, res) => {
  const scope = "ZohoBooks.fullaccess.all";
  if (!ZOHO_AUTH_URL) return res.status(500).send("ZOHO_AUTH_URL not set in .env");

  const url = `${ZOHO_AUTH_URL}/auth?scope=${scope}&client_id=${ZOHO_CLIENT_ID}&response_type=code&access_type=offline&prompt=consent&redirect_uri=${ZOHO_REDIRECT_URI}`;
  console.log("🔗 Redirecting to Zoho login:", url);
  res.redirect(url);
});

// =======================
// 2️⃣ Zoho Callback (save tokens in DB)
// =======================
router.get("/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("❌ No code received from Zoho. Start with /login");

  try {
    const tokenRes = await axios.post(
      `${ZOHO_AUTH_URL}/token`,
      querystring.stringify({
        code,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        redirect_uri: ZOHO_REDIRECT_URI,
        grant_type: "authorization_code"
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const tokens = tokenRes.data;
    console.log("🔑 Raw token response from Zoho:", tokens);

    if (!tokens.access_token || !tokens.refresh_token) {
      return res.status(500).send("❌ Tokens missing from Zoho. Try /api/zoho/login again.");
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Clear old tokens and insert fresh ones
    await db.promise().query("DELETE FROM zoho_tokens");
    await db
      .promise()
      .query(
        "INSERT INTO zoho_tokens (access_token, refresh_token, expires_at) VALUES (?,?,?)",
        [tokens.access_token, tokens.refresh_token, expiresAt]
      );

    console.log("✅ Tokens saved in DB:", tokens);
    res.json({ message: "Zoho OAuth Success 🎉", tokens });
  } catch (err) {
    console.error("❌ Zoho callback error:", err.response?.data || err.message);
    res.status(500).send("Error fetching token from Zoho");
  }
});

// =======================
// 3️⃣ Fetch Customers
// =======================
router.get("/customers", async (req, res) => {
  try {
    const data = await callZohoBooks("contacts", "GET");
    const customers = (data.contacts || []).map(c => ({
      id: c.contact_id,
      name: c.contact_name,
      email: c.email || ""
    }));
    res.json(customers);
  } catch (err) {
    console.error("❌ Error fetching customers:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

export default router;
