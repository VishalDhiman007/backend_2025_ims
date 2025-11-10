import express from "express";
import db from "../config/db.js";
import { callZohoBooks } from "../zohoHelper.js";

const router = express.Router();

// ==============================================
//                 Helper functions
// ==============================================
const sanitizeItemName = (str) => {
  if (!str) return "Unnamed Item";
  return str
    .trim()
    .replace(/[^a-zA-Z0-9\s\-.]/g, "")
    .substring(0, 99);
};

const sanitizeSKU = (str) => {
  if (!str) return undefined;
  return str
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 50);
};

// =====================================================
// POST /api/sales/add
// Supports single-product or multi-item sales
// =====================================================
router.post("/add", async (req, res) => {
  const { customerId, items, productId, quantity } = req.body;

  try {
    // ==================================================
    //               Handle multi-item sales
    // ==================================================
    if (items && Array.isArray(items) && items.length > 0) {
      let line_items = [];
      let saleIds = [];

      for (const item of items) {
        // const { productId, quantity } = item;
        const { productId, quantity, sales_rate } = item;


        const [prodRows] = await db
          .promise()
          .query("SELECT * FROM products WHERE id=?", [productId]);
        const product = prodRows[0];
        if (!product) throw new Error(`Product ID ${productId} not found`);

        const [assignedCheck] = await db
          .promise()
          .query(
            "SELECT * FROM employee_products WHERE product_id = ? AND is_active = 1",
            [productId]
          );
        if (assignedCheck.length > 0) {
          throw new Error(
            `Product ${productId} is currently assigned to an employee and cannot be sold.`
          );
        }

        const availableQty = product.qty - (product.reserved_qty || 0);
        if (quantity > availableQty)
          throw new Error(
            `Only ${availableQty} units available for ${product.name}`
          );

        const itemName = sanitizeItemName(product.name);
        const itemSKU = sanitizeSKU(product.model);
        // const rate = Number(product.rate || 0);
        // const rate = Number(product.sales_rate || product.rate || 0);
        const rate = Number(sales_rate || product.sales_rate || product.rate || 0);



        let itemId = product.zoho_item_id;
        if (!itemId) {
          const searchResult = await callZohoBooks("items", "GET", null, {
            name: itemName,
          });
          if (searchResult.items && searchResult.items.length > 0) {
            itemId = searchResult.items[0].item_id;
          } else {
            const created = await callZohoBooks("items", "POST", {
              name: itemName,
              sku: itemSKU,
              rate,
            });
            if (!created.item?.item_id)
              throw new Error("Zoho item creation failed");
            itemId = created.item.item_id;
          }
          await db
            .promise()
            .query("UPDATE products SET zoho_item_id=? WHERE id=?", [
              itemId,
              productId,
            ]);
        }

        line_items.push({ item_id: itemId, quantity: Number(quantity), rate, description: `Model: ${product.model || "N/A"}, Serial: ${product.serialNo || "N/A"}`
       });

        // ==============================================================
        //          Save local sale (payment_status = pending)
        // ==============================================================
        const [ins] = await db
          .promise()
          .query(
            "INSERT INTO sales (product_id, quantity, customer_id, sale_date, payment_status) VALUES (?,?,?,?, 'pending')",
            [productId, quantity, customerId, new Date()]
          );
        saleIds.push(ins.insertId);

        //=======================================
        //            Reserve stock
        //=======================================
        await db
          .promise()
          .query(
            "UPDATE products SET reserved_qty = reserved_qty + ? WHERE id=?",
            [quantity, productId]
          );
      }

      // =========================================
      //              Create Zoho invoice
      // =========================================
      const invoicePayload = { customer_id: customerId, line_items };
      const inv = await callZohoBooks("invoices", "POST", invoicePayload);
      if (!inv.invoice?.invoice_id)
        throw new Error("Zoho invoice creation failed");

      const invoiceId = inv.invoice.invoice_id;
      const invoiceUrl = inv.invoice.invoice_url;

      //=======================================================
      //           Update all sales with invoice info
      //=======================================================
      for (const saleId of saleIds) {
        await db
          .promise()
          .query("UPDATE sales SET invoice_id=?, invoice_url=? WHERE id=?", [
            invoiceId,
            invoiceUrl,
            saleId,
          ]);
      }

      return res.json({ success: true, saleIds, invoiceId, invoiceUrl });
    }

    // =============================================================
    //                  Handle single-product sale
    // =============================================================
    if (!productId || !quantity || !customerId) {
      return res.status(400).json({ success: false, msg: "Missing fields" });
    }

    const [prodRows] = await db
      .promise()
      .query("SELECT * FROM products WHERE id=?", [productId]);
    const product = prodRows[0];
    if (!product)
      return res.status(404).json({ success: false, msg: "Product not found" });

    const [assignedCheck] = await db
      .promise()
      .query(
        "SELECT * FROM employee_products WHERE product_id = ? AND is_active = 1",
        [productId]
      );
    if (assignedCheck.length > 0) {
      return res.status(400).json({
        success: false,
        msg: `Product ${productId} is currently assigned to an employee and cannot be sold.`,
      });
    }

    const itemName = sanitizeItemName(product.name);
    const itemSKU = sanitizeSKU(product.model);
    // const rate = Number(product.rate || 0);
 const rate = Number(sales_rate || product.sales_rate || product.rate || 0);

const [ins] = await db
  .promise()
  .query(
    "INSERT INTO sales (product_id, quantity, customer_id, sale_date, sales_rate, payment_status) VALUES (?,?,?,?,?, 'pending')",
    [productId, quantity, customerId, new Date(), rate]
  );

const saleId = ins.insertId;


    let itemId = product.zoho_item_id;
    if (!itemId) {
      const searchResult = await callZohoBooks("items", "GET", null, {
        name: itemName,
      });
      if (searchResult.items && searchResult.items.length > 0) {
        itemId = searchResult.items[0].item_id;
      } else {
        const created = await callZohoBooks("items", "POST", {
          name: itemName,
          sku: itemSKU,
          rate,
        });
        if (!created.item?.item_id)
          throw new Error("Zoho item creation failed");
        itemId = created.item.item_id;
      }
      await db
        .promise()
        .query("UPDATE products SET zoho_item_id=? WHERE id=?", [itemId, productId]);
    }

    const invoicePayload = {
      customer_id: customerId,
      line_items: [{ item_id: itemId, quantity: Number(quantity), rate,description: `Model: ${product.model || "N/A"}, Serial: ${product.serialNo || "N/A"}`
       }],
    };
    const inv = await callZohoBooks("invoices", "POST", invoicePayload);
    if (!inv.invoice?.invoice_id)
      throw new Error("Zoho invoice creation failed");

    const invoiceId = inv.invoice.invoice_id;
    const invoiceUrl = inv.invoice.invoice_url;

    await db
      .promise()
      .query("UPDATE sales SET invoice_id=?, invoice_url=? WHERE id=?", [
        invoiceId,
        invoiceUrl,
        saleId,
      ]);

    //=================================================
    //                  Reserve stock
    //=================================================
    await db
      .promise()
      .query("UPDATE products SET reserved_qty = reserved_qty + ? WHERE id=?", [
        quantity,
        productId,
      ]);

    res.json({ success: true, saleId, invoiceId, invoiceUrl });
  } catch (err) {
    console.error(
      "Sales creation error:",
      err.message,
      err.response?.data || ""
    );
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ============================================================
//          GET /api/sales/payment-status/:invoiceId
// ============================================================
router.get("/payment-status/:invoiceId", async (req, res) => {
  const { invoiceId } = req.params;
  if (!invoiceId)
    return res.status(400).json({ success: false, msg: "Invoice ID required" });

  try {
    const invoice = await callZohoBooks(`invoices/${invoiceId}`, "GET");
    const paymentStatus = invoice.invoice?.payment_status || "unknown";
    const amountPaid = invoice.invoice?.payment_made || 0;

    if (paymentStatus === "paid") {
      const [sales] = await db
        .promise()
        .query("SELECT product_id, quantity FROM sales WHERE invoice_id=?", [
          invoiceId,
        ]);

      for (const sale of sales) {
        await db.promise().query(
          `UPDATE products 
           SET qty = qty - ?, reserved_qty = reserved_qty - ?
           WHERE id = ?`,
          [sale.quantity, sale.quantity, sale.product_id]
        );
      }

      await db
        .promise()
        .query("UPDATE sales SET payment_status='paid' WHERE invoice_id=?", [
          invoiceId,
        ]);
    } else if (paymentStatus === "cancelled") {
      const [sales] = await db
        .promise()
        .query("SELECT product_id, quantity FROM sales WHERE invoice_id=?", [
          invoiceId,
        ]);

      for (const sale of sales) {
        await db.promise().query(
          `UPDATE products 
           SET reserved_qty = reserved_qty - ?
           WHERE id = ?`,
          [sale.quantity, sale.product_id]
        );
      }

      await db
        .promise()
        .query("UPDATE sales SET payment_status='cancelled' WHERE invoice_id=?", [
          invoiceId,
        ]);
    }

    res.json({ success: true, invoiceId, paymentStatus, amountPaid });
  } catch (err) {
    console.error("Payment status error:", err.message);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ===================================================================
//                   Zoho Webhook: Invoice Updated
// ===================================================================
router.post("/webhook/invoice-updated", async (req, res) => {
  console.log("Webhook payload:", req.body);
  try {
    const { invoice_id, payment_status } = req.body;

    if (!invoice_id) {
      return res.status(400).json({ success: false, msg: "Missing invoice_id" });
    }

    const [sales] = await db
      .promise()
      .query("SELECT product_id, quantity FROM sales WHERE invoice_id=?", [invoice_id]);

    if (sales.length === 0) {
      return res.json({ success: true, msg: "No related sales found." });
    }

    if (payment_status === "paid") {
      for (const sale of sales) {
        await db.promise().query(
          `UPDATE products 
           SET qty = qty - ?, reserved_qty = reserved_qty - ? 
           WHERE id = ?`,
          [sale.quantity, sale.quantity, sale.product_id]
        );
      }
      await db.promise().query(
        "UPDATE sales SET payment_status='paid' WHERE invoice_id=?",
        [invoice_id]
      );
    } else if (payment_status === "cancelled") {
      for (const sale of sales) {
        await db.promise().query(
          `UPDATE products 
           SET reserved_qty = reserved_qty - ? 
           WHERE id = ?`,
          [sale.quantity, sale.product_id]
        );
      }
      await db.promise().query(
        "UPDATE sales SET payment_status='cancelled' WHERE invoice_id=?",
        [invoice_id]
      );
    }

    res.json({ success: true, msg: "Invoice status synced successfully." });
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ===============================================
//             Sales Reporting APIs
// ===============================================
router.get("/report/total", async (req, res) => {
  const [rows] = await db
    .promise()
    .query(
      "SELECT COUNT(*) as totalSales, SUM(quantity*rate) as totalRevenue FROM sales"
    );
  res.json({ success: true, report: rows[0] });
});

router.get("/report/product", async (req, res) => {
  const [rows] = await db.promise().query(`
    SELECT p.name, SUM(s.quantity) as totalQty, SUM(s.quantity*s.rate) as totalRevenue
    FROM sales s
    JOIN products p ON s.product_id = p.id
    GROUP BY p.id
  `);
  res.json({ success: true, report: rows });
});

router.get("/report/customer", async (req, res) => {
  const [rows] = await db.promise().query(`
    SELECT c.name, SUM(s.quantity*s.rate) as totalSpent
    FROM sales s
    JOIN customers c ON s.customer_id = c.id
    GROUP BY c.id
  `);
  res.json({ success: true, report: rows });
});

router.get("/report/unpaid", async (req, res) => {
  const [rows] = await db
    .promise()
    .query("SELECT * FROM sales WHERE payment_status != 'paid'");
  res.json({ success: true, report: rows });
});

export default router;
