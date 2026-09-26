import { SERVICE_URL, hasService, withTimeout } from './config';

/**
 * One way to talk to the order service.
 *
 * Errors carry what the server said — `message`, and when present `status`,
 * `code` (e.g. 'stock', 'minimum', 'discount') and `problems` — so screens can
 * tell the shopper what to fix rather than showing a generic failure.
 */
export async function call(path, { method = 'GET', body, token } = {}) {
  if (!hasService()) {
    throw Object.assign(new Error('The store service is not configured in this build.'), {
      code: 'no-service',
    });
  }
  const res = await withTimeout((signal) =>
    fetch(`${SERVICE_URL}${path}`, {
      method,
      signal,
      // Codespaces answers a port-forward request with an HTML login page
      // unless the port is public; asking for JSON makes that obvious.
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`service returned non-JSON (is the port public?): ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    throw Object.assign(new Error(json.error ?? `service HTTP ${res.status}`), {
      status: res.status,
      code: json.code,
      problems: json.problems,
    });
  }
  return json;
}
