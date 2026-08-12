/**
 * Fetch wrapper shared by the backend, Shopify, and Bosta clients.
 * Timeout plus bounded retry — a warehouse phone on patchy wifi should retry
 * a dropped request rather than dumping the operator back to an error screen.
 */

export class ApiError extends Error {
  constructor(message, { service, status = null, body = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.service = service;
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retryable = (status) => status === 429 || (status >= 500 && status <= 599);

export async function requestJson(
  url,
  { service = "api", method = "GET", headers = {}, body, timeoutMs = 20000, retries = 2 } = {},
) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(2 ** (attempt - 1) * 800);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: { Accept: "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }

      if (!response.ok) {
        const error = new ApiError(`${service} responded ${response.status}`, {
          service,
          status: response.status,
          body: parsed,
        });
        if (retryable(response.status) && attempt < retries) {
          lastError = error;
          continue;
        }
        throw error;
      }

      return parsed;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      lastError = new ApiError(
        error.name === "AbortError" ? `${service} timed out` : `${service} failed: ${error.message}`,
        { service },
      );
      if (attempt >= retries) throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}
