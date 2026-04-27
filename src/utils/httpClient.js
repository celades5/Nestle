import axios from "axios";
import { getAccessToken, clearAccessTokenCache } from "../clients/commercetoolsAuth.js";
import { config } from "../config/index.js";

/*
 * Axios client for commercetools API 
 * Requires CTP_API_URL and CTP_PROJECT_KEY
 */
export function CommercetoolsApiClient() {
  if (!config.apiUrl) {
    throw new Error("CTP_API_URL is required for API calls");
  }
  if (!config.projectKey) {
    throw new Error("CTP_PROJECT_KEY is required for API calls");
  }

  const baseURL = `${config.apiUrl}/${config.projectKey}`;

  const client = axios.create({
    baseURL,
    timeout: 60_000,
  });

  client.interceptors.request.use(async (req) => {
    const token = await getAccessToken();
    req.headers.Authorization = `Bearer ${token}`;
    return req;
  });

  client.interceptors.response.use(
    (res) => res,
    async (error) => {
      if (error.response?.status === 401) {
        clearAccessTokenCache();
      }
      return Promise.reject(error);
    }
  );

  return client;
}
