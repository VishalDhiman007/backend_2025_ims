import axios from "axios";
import db from "./config/db.js";
import dotenv from "dotenv";
dotenv.config();

const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_ORG_ID, ZOHO_AUTH_URL } = process.env;

// ✅ Get or refresh access token
export async function getAccessToken() {
  const [rows] = await db.promise().query("SELECT * FROM zoho_tokens LIMIT 1");
  const tokenRow = Array.isArray(rows) ? rows[0] : rows;
  if (!tokenRow) throw new Error("No Zoho tokens found. Login via /api/zoho/login");

  let accessToken = tokenRow.access_token;

  if (new Date() > new Date(tokenRow.expires_at)) {
    console.log("Access token expired, refreshing...");
    const res = await axios.post(`${ZOHO_AUTH_URL}/token`, null, {
      params: {
        refresh_token: tokenRow.refresh_token,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        grant_type: "refresh_token",
      },
    });

    accessToken = res.data.access_token;
    const expiresAt = new Date(Date.now() + res.data.expires_in * 1000);

    await db.promise().query(
      "UPDATE zoho_tokens SET access_token = ?, expires_at = ? WHERE id = ?",
      [accessToken, expiresAt, tokenRow.id]
    );
    console.log("Token refreshed & saved in DB");
  }

  return accessToken;
}

// ✅ Generic Zoho API call
export async function callZohoBooks(path, method = "GET", data = null, params = {}) {
  const token = await getAccessToken();
  const url = `https://www.zohoapis.in/books/v3/${path}`;
  const res = await axios({
    method,
    url,
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    params: { organization_id: ZOHO_ORG_ID, ...params },
    data,
  });
  return res.data;
}

// ✅ Create Item in Zoho
export async function createZohoItem({ name, sku, rate }) {
  const payload = { name, sku, rate };
  const data = await callZohoBooks("items", "POST", payload);
  return data.item;
}

// ✅ Create Sales / Invoice
export async function createZohoInvoice({ customer_id, items }) {
  const payload = {
    customer_id,
    line_items: items.map(i => ({
      item_id: i.zoho_item_id,
     rate: i.sales_rate || i.rate || 0,
     
      quantity: i.quantity,
    })),
  };
  const data = await callZohoBooks("invoices", "POST", payload);
  return data.invoice;
}
