import dotenv from "dotenv";

dotenv.config();

const requiredAuth = [
  "CTP_CLIENT_ID",
  "CTP_CLIENT_SECRET",
  "CTP_AUTH_URL",
  "CTP_SCOPE",
];

function readEnv() {
  const missing = requiredAuth.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. See .env.`
    );
  }

  return {
    clientId: process.env.CTP_CLIENT_ID.trim(),
    clientSecret: process.env.CTP_CLIENT_SECRET.trim(),
    authUrl: process.env.CTP_AUTH_URL.replace(/\/$/, ""),
    apiUrl: (process.env.CTP_API_URL ?? "").replace(/\/$/, ""),
    projectKey: (process.env.CTP_PROJECT_KEY ?? "").trim(),
    scope: process.env.CTP_SCOPE.trim(),
  };
}

export const config = readEnv();
