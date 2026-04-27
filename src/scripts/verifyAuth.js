/**
 * Quick check: load env, obtain commercetools access token.
 * Run: npm run auth:verify
 */
import { getAccessToken } from "../clients/commercetoolsAuth.js";

try {
  const token = await getAccessToken();
  console.log("commercetools auth OK. Token length:", token.length);
} catch (e) {
  console.error(e.message);
  const err = e.cause;
  if (err?.response?.data) {
    console.error(JSON.stringify(err.response.data, null, 2));
  } else if (err) {
    console.error(err.message ?? err);
  }
  process.exit(1);
}
