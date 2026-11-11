/**
 * Resolves the absolute base URL the app should redirect to.
 *
 * NEXT_PUBLIC_APP_URL is optional. When it is set but malformed (for example
 * `planoramaph.vercel.app` without a protocol, wrapped in quotes, or with a
 * trailing path), `new URL(path, base)` throws "Invalid URL", which used to
 * crash the OAuth callback with a bare HTTP 500. This helper normalizes the
 * value when it can and otherwise falls back to the request's own origin, so
 * it never throws.
 */
export function normalizeBaseUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let value = raw.trim().replace(/^['"]+|['"]+$/g, "").trim();
  if (!value) return null;

  // Accept bare hosts such as "planoramaph.vercel.app" or "localhost:3000".
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(value);
    value = `${isLocal ? "http" : "https"}://${value.replace(/^\/+/, "")}`;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveAppBaseUrl(requestUrl?: string | URL | null): string {
  const fromEnv = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (fromEnv) return fromEnv;

  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // fall through
    }
  }
  return "http://localhost:3000";
}
