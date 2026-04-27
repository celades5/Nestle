import { fetchAllPublishedProducts } from "../scripts/endpoint.js";
import { simplifyProductProjection } from "../utils/productMapper.js";
import {
  createProductTable,
  insertProduct,
} from "../db/db.js";

/**
 * Pull all published projections from commercetools, simplify to 5 fields
 */
export async function syncProductsFromCommercetools() {
  await createProductTable();
  const raw = await fetchAllPublishedProducts();
  for (const projection of raw) {
    const p = simplifyProductProjection(projection);
    await insertProduct(p);
  }
  return raw.length;
}
