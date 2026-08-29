/** Thin client for the FastAPI backend. All calls are stateless. */

export class ApiError extends Error {
  constructor(message, { status = 0, code = "error", details = [] } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function normalizeBase(base) {
  return String(base || "").trim().replace(/\/+$/, "");
}

async function request(base, path, { method = "GET", body, timeout = 15000 } = {}) {
  const url = `${normalizeBase(base)}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error.name === "AbortError") {
      throw new ApiError(`The request to ${url} timed out.`, { code: "timeout" });
    }
    throw new ApiError(
      `Could not reach ${url}. Check that uvicorn is running and that this origin is listed in CORS_ORIGINS.`,
      { code: "network" },
    );
  }
  clearTimeout(timer);

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (response.ok) return payload;

  if (response.status === 422 && payload && Array.isArray(payload.detail)) {
    throw new ApiError("The product did not match the schema.", {
      status: 422,
      code: "validation",
      details: payload.detail.map((item) => ({
        field: Array.isArray(item.loc) ? item.loc.filter((part) => part !== "body").join(".") : "",
        message: String(item.msg || "Invalid value"),
      })),
    });
  }

  const message = payload && typeof payload.detail === "string"
    ? payload.detail
    : `Request failed with HTTP ${response.status}.`;
  throw new ApiError(message, {
    status: response.status,
    code: response.status === 404 ? "not_found" : "http",
  });
}

export const getHealth = (base) => request(base, "/health", { timeout: 6000 });

export const getSchema = (base) => request(base, "/api/v1/schema", { timeout: 8000 });

export const scoreProduct = (base, payload) =>
  request(base, "/api/v1/score", { method: "POST", body: payload, timeout: 20000 });

/**
 * Optional enrichment hook owned by the generation track. The endpoint does not
 * exist yet; a 404 is reported to the user rather than treated as a failure.
 * Accepts either a bare Product or an envelope such as { product: {...} }.
 */
export async function generateProduct(base, payload) {
  const result = await request(base, "/api/v1/generate", {
    method: "POST",
    body: payload,
    timeout: 90000,
  });
  if (result && typeof result === "object" && result.product && typeof result.product === "object") {
    return result.product;
  }
  return result;
}
