import "dotenv/config";
import express from "express";
import { createProductTable, pool } from "./db/db.js";

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());

// GET /products -> list all synced products
app.get("/products", async (req, res) => {
  try {
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

    const productName = pending.rows[0].name || productId;
    await pool.query("UPDATE products SET reviewed = TRUE WHERE id = $1", [
      productId,
    ]);
    return res.status(200).json({
      message: "Product marked as reviewed",
      product: { id: productId, name: productName },
    });
  } catch (error) {
    console.error("Error marking product as reviewed:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});


async function main() {
  await createProductTable();
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
