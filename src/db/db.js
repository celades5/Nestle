import "dotenv/config";
import { fileURLToPath } from "node:url";
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  throw new Error("DATABASE_URL is missing. Set it in .env — see .env.example.");
}

export const pool = new pg.Pool({ connectionString });

export async function createProductTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      price NUMERIC(14, 4),
      value DOUBLE PRECISION,
      in_stock BOOLEAN,
      reviewed BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * @param {{ id: string, name: string, price: number | null, value: number | null, inStock: boolean | null }} p
 */
export async function insertProduct(p) {
  await pool.query(
    `INSERT INTO products (id, name, price, value, in_stock, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       price = EXCLUDED.price,
       value = EXCLUDED.value,
       in_stock = EXCLUDED.in_stock,
       updated_at = NOW()`,
    [p.id, p.name, p.price, p.value, p.inStock]
  );
}

export async function countProducts() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM products");
  return rows[0]?.n ?? 0;
}

/**
 * Run: npm run db:sync
 */
async function runSyncCli() {
  const { syncProductsFromCommercetools } = await import(
    "../services/syncService.js"
  );

  try {
    const fetched = await syncProductsFromCommercetools();
    const inDb = await countProducts();
    console.log(
      "Sync OK — processed",
      fetched,
      "projections from commercetools."
    );
    console.log("Rows in products table:", inDb);
  } catch (e) {
    console.error(e.message);
    if (e.code) console.error("code:", e.code);
    await pool.end();
    process.exit(1);
  }

  await pool.end();
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  runSyncCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
