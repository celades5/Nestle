import "dotenv/config";
import { fileURLToPath } from "node:url";
import express from "express";
import { publishProductReview } from "./clients/kafka.js";
import { createProductTable, pool } from "./db/db.js";

/** @param {import("pg").QueryResultRow} row */
function productRowSimplified(row) {
  return {
    id: String(row.id),
    name: row.name ?? "",
    price: row.price != null ? Number(row.price) : null,
    value: row.value != null ? Number(row.value) : null,
    inStock: row.in_stock,
  };
}

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());

/**
 * @returns {{ kind: "all" } | { kind: "where", value: boolean } | { kind: "bad" }}
 */
function parseReviewedQueryParam(raw) {
  if (raw === undefined) return { kind: "all" };
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "" || v == null) return { kind: "all" };
  if (typeof v === "boolean") {
    return { kind: "where", value: v };
  }
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") {
    return { kind: "where", value: true };
  }
  if (s === "false" || s === "0" || s === "no") {
    return { kind: "where", value: false };
  }
  return { kind: "bad" };
}

// GET /products -> list all synced products
// GET /products?reviewed=true|false
app.get(["/products", "/products/"], async (req, res) => {
  try {
    const filter = parseReviewedQueryParam(req.query.reviewed);
    if (filter.kind === "bad") {
      return res.status(400).json({
        message: "Invalid review status.",
        validValues: ["true", "false"],
      });
    }
    if (filter.kind === "where") {
      const { rows } = await pool.query(
        "SELECT * FROM products WHERE reviewed = $1 ORDER BY id ASC",
        [filter.value]
      );
      return res.status(200).json(rows);
    }
    const { rows } = await pool.query(
      "SELECT * FROM products ORDER BY id ASC"
    );
    return res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching products:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /products/:id -> get one product by id
app.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows, rowCount } = await pool.query(
      "SELECT * FROM products WHERE id = $1",
      [id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error fetching product:", error);
    return res.status(500).json({
      message: "Failed to fetch product",
      error: error.message,
    });
  }
});

// POST /productreviewed/:id -> mark a product as reviewed
app.post("/productreviewed/:id", async (req, res) => {
  try {
    const { id: productId } = req.params;
    const pending = await pool.query(
      "SELECT * FROM products WHERE id = $1 AND reviewed = FALSE",
      [productId]
    );

    if (pending.rowCount === 0) {
      const existing = await pool.query(
        "SELECT id, name, reviewed FROM products WHERE id = $1",
        [productId]
      );
      if (existing.rowCount === 0) {
        return res.status(404).json({ message: "Product not found" });
      }
      const name = existing.rows[0].name || productId;
      return res.status(409).json({
        message: "Product already reviewed",
        product: { id: productId, name },
      });
    }

    const row = pending.rows[0];
    const productName = row.name || productId;
    const simplified = productRowSimplified(row);
    const reviewedAt = new Date().toISOString();

    await pool.query("UPDATE products SET reviewed = TRUE WHERE id = $1", [
      productId,
    ]);
    try {
      await publishProductReview(simplified, reviewedAt);
    } catch (err) {
      console.error("Kafka publish failed:", err);
      await pool.query("UPDATE products SET reviewed = FALSE WHERE id = $1", [
        productId,
      ]);
      return res.status(503).json({
        message:
          "Review was not published to the event bus; state was rolled back. Try again.",
        error: err.message,
      });
    }

    return res.status(200).json({
      message: "Product marked as reviewed",
      product: { id: productId, name: productName },
    });
  } catch (error) {
    console.error("Error marking product as reviewed:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});


export { app };

async function main() {
  await createProductTable();
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain && !process.env.VITEST) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
