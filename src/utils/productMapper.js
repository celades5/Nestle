/**
 * Map commercetools ProductProjection into 5 fields:
 * id, name, price, rating, inStock.
 */

const DEFAULT_LOCALE_ORDER = ["en-GB", "en-US", "de-DE", "pt-BR"];
const DEFAULT_PRICE_CURRENCY = "GBP";
const SIMPLIFIED_KEYS = ["id", "name", "price", "value", "inStock"];

/** Throws if `obj` does not have exactly those five keys */
export function verifySimplifiedProductShape(obj) {
  if (!obj || typeof obj !== "object") {
    throw new Error("verifySimplifiedProductShape: expected an object");
  }
  const keys = Object.keys(obj);
  if (keys.length !== SIMPLIFIED_KEYS.length) {
    throw new Error(
      `expected keys [${SIMPLIFIED_KEYS.join(", ")}], got: ${keys.join(", ")}`
    );
  }
  for (const k of SIMPLIFIED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) {
      throw new Error(`missing key "${k}"`);
    }
  }
}

/**
 * @param {Record<string, string> | undefined} localized
 * @param {string[]} localePreference
 * @returns {string}
 */
function pickLocalized(localized, localePreference) {
  if (!localized || typeof localized !== "object") return "";
  for (const loc of localePreference) {
    const v = localized[loc];
    if (v != null && String(v).length > 0) return String(v);
  }
  const first = Object.values(localized).find((v) => v != null && String(v).length > 0);
  return first != null ? String(first) : "";
}

/**
 * @returns {number | null}
 */
function pickStarsValue(variant) {
  const attrs = variant?.attributes;
  if (!Array.isArray(attrs)) return null;
  const row = attrs.find((a) => a?.name === "stars");
  if (row == null || typeof row.value !== "number") return null;
  return row.value;
}

/**
 * @returns {boolean | null}
 */
function pickAnyChannelInStock(variant) {
  const channels = variant?.availability?.channels;
  if (!channels || typeof channels !== "object") return null;
  const list = Object.values(channels);
  if (list.length === 0) return null;
  return list.some((c) => c?.isOnStock === true);
}

/**
 * @param {object} variant
 * @param {string} priceCurrency
 * @returns {number | null}
 */
function pickPriceMajor(variant, priceCurrency) {
  const prices = variant?.prices;
  if (!Array.isArray(prices) || prices.length === 0) return null;

  const match = prices.find((p) => p?.value?.currencyCode === priceCurrency);
  const chosen = match ?? prices[0];
  const value = chosen?.value;

  if (!value || value.type !== "centPrecision") return null;
  const { centAmount, fractionDigits } = value;
  if (typeof centAmount !== "number" || typeof fractionDigits !== "number") return null;
  return centAmount / 10 ** fractionDigits;
}

/**
 * @param {object} projection
 * @param {object} [options]
 * @param {string[]} [options.localePreference]
 * @param {string} [options.priceCurrency]
 * @returns {{ id: string, name: string, price: number | null, value: number | null, inStock: boolean | null }}
 */
export function simplifyProductProjection(projection, options = {}) {
  const envLocale = process.env.CTP_LOCALE?.trim();
  const localePreference =
    options.localePreference ??
    (envLocale
      ? [envLocale, ...DEFAULT_LOCALE_ORDER.filter((l) => l !== envLocale)]
      : DEFAULT_LOCALE_ORDER);

  const priceCurrency =
    options.priceCurrency ??
    (process.env.CTP_PRICE_CURRENCY?.trim() || DEFAULT_PRICE_CURRENCY);

  const variant = projection?.masterVariant ?? {};

  return {
    id: projection?.id != null ? String(projection.id) : "",
    name: pickLocalized(projection?.name, localePreference),
    price: pickPriceMajor(variant, priceCurrency),
    value: pickStarsValue(variant),
    inStock: pickAnyChannelInStock(variant),
  };
}

/**
 * @param {object[]} projections
 * @param {object} [options]
 * @returns {{ id: string, name: string, price: number | null, value: number | null, inStock: boolean | null }[]}
 */
export function simplifyProductProjections(projections, options = {}) {
  return projections.map((p) => simplifyProductProjection(p, options));
}
