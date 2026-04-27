import axios from "axios";
import { config } from "../config/index.js";

let cachedToken = null;
let tokenExpiresAt = null;

/**
 * commercetools OAuth2 Client Credentials.
 * Caches the access token until expiration.
 */
export async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt && now < tokenExpiresAt) {
    return cachedToken;
  }

  const tokenUrl = `${config.authUrl}/oauth/token`;

  try {
    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: "client_credentials",
        scope: config.scope,
      }),
      {
        auth: {
          username: config.clientId,
          password: config.clientSecret,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 30_000,
      }
    );

    const { access_token, expires_in } = response.data;

    if (!access_token || typeof expires_in !== "number") {
      throw new Error("Invalid token response from commercetools");
    }

    cachedToken = access_token;
    const ttlMs = Math.max(0, (expires_in - 30) * 1000);
    tokenExpiresAt = now + ttlMs;

    return access_token;
  } catch (err) {
    const details = err.response?.data ?? err.message;
    console.error("commercetools token request failed:", details);
    throw new Error("commercetools authentication failed", { cause: err });
  }
}

/*Clears cached token*/
export function clearAccessTokenCache() {
  cachedToken = null;
  tokenExpiresAt = null;
}
