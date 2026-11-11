import { afterEach, describe, expect, it } from "vitest";
import { normalizeBaseUrl, resolveAppBaseUrl } from "./app-url";

const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
});

describe("normalizeBaseUrl", () => {
  it("keeps a valid absolute URL as its origin", () => {
    expect(normalizeBaseUrl("https://planoramaph.vercel.app/")).toBe("https://planoramaph.vercel.app");
    expect(normalizeBaseUrl("https://planoramaph.vercel.app/some/path")).toBe("https://planoramaph.vercel.app");
  });

  it("adds a protocol to bare hosts", () => {
    expect(normalizeBaseUrl("planoramaph.vercel.app")).toBe("https://planoramaph.vercel.app");
    expect(normalizeBaseUrl("localhost:3000")).toBe("http://localhost:3000");
  });

  it("strips whitespace and quotes", () => {
    expect(normalizeBaseUrl('  "https://planoramaph.vercel.app"\n')).toBe("https://planoramaph.vercel.app");
  });

  it("rejects empty or unusable values", () => {
    expect(normalizeBaseUrl(undefined)).toBeNull();
    expect(normalizeBaseUrl("   ")).toBeNull();
    expect(normalizeBaseUrl("https://")).toBeNull();
    expect(normalizeBaseUrl("ftp://example.com")).toBeNull();
  });
});

describe("resolveAppBaseUrl", () => {
  it("falls back to the request origin when the env value is malformed", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://";
    expect(resolveAppBaseUrl("https://planoramaph.vercel.app/api/auth/google/callback?code=x")).toBe(
      "https://planoramaph.vercel.app"
    );
  });

  it("falls back to the request origin when the env value is unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(resolveAppBaseUrl("https://planoramaph.vercel.app/x")).toBe("https://planoramaph.vercel.app");
  });

  it("never throws", () => {
    process.env.NEXT_PUBLIC_APP_URL = "::not a url::";
    expect(() => resolveAppBaseUrl("also not a url")).not.toThrow();
  });
});
