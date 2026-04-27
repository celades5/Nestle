/**
 * commercetools Product Projections (published catalog).
 * Import `fetchPublishedProduct` / `fetchAllPublishedProducts` 
 */
import { CommercetoolsApiClient } from "../utils/httpClient.js";

const DEFAULT_LIMIT = 100;

/**
 * One page: GET /product-projections with staged=false (published).
 */
export async function fetchPublishedProduct(
  offset = 0,
  limit = DEFAULT_LIMIT
) {
  const client = CommercetoolsApiClient();
  const { data } = await client.get("/product-projections", {
    params: {
      staged: false,
      limit,
      offset,
    },
  });
  return data;
}

/**
 * Full catalog: paginate until a page returns fewer than `pageLimit` results.
 */
export async function fetchAllPublishedProducts(
  pageLimit = DEFAULT_LIMIT
) {
  const client = CommercetoolsApiClient();
  const all = [];
  let offset = 0;

  for (;;) {
    const { data } = await client.get("/product-projections", {
      params: {
        staged: false,
        limit: pageLimit,
        offset,
      },
    });

    const results = data.results ?? [];
    all.push(...results);

    if (results.length < pageLimit) break;
    offset += pageLimit;
  }

  return all;
}
