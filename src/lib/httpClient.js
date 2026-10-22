/**
 * One fetch wrapper for both upstreams: timeout, bounded retry with
 * exponential backoff, and errors that carry the upstream status and body
 * so a failed AWB creation says *why* instead of "request failed".
 */

export class UpstreamError extends Error {
  constructor(message, { service, status = null, body = null, cause = null } = {}) {
    super(message);
    this.name = "UpstreamError";
    this.service = service;
    this.status = status;
    this.body = body;
    if (cause) this.cause = cause;
  }

  toJSON() {
    return { service: this.service, status: this.status, message: this.message, body: this.body };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 429 and 5xx are worth another try; 4xx means the request itself is wrong.
const isRetryableStatus = (status) => status === 429 || (status >= 500 && status <= 599);

export async function requestJson(
  url,
  { service = "upstream", method = "GET", headers = {}, body, timeoutMs = 30000, retries = 3 } = {},
) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(2 ** (attempt - 1) * 1000);

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
        parsed = text; // Non-JSON error pages from a proxy, kept for the message.
      }

      if (!response.ok) {
        const error = new UpstreamError(
          `${service} responded ${response.status} ${response.statusText}`,
          { service, status: response.status, body: parsed },
        );
        if (isRetryableStatus(response.status) && attempt < retries) {
          lastError = error;
          continue;
        }
        throw error;
      }

      return parsed;
    } catch (error) {
      if (error instanceof UpstreamError) throw error;

      // Network-level failure or abort — retryable until the budget runs out.
      lastError = new UpstreamError(
        error.name === "AbortError"
          ? `${service} timed out after ${timeoutMs}ms`
          : `${service} request failed: ${error.message}`,
        { service, cause: error },
      );
      if (attempt >= retries) throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}
