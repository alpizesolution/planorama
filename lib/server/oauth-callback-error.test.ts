import { describe, expect, it } from "vitest";
import { classifyOAuthCallbackError } from "./oauth-callback-error";
import { MissingSecretError } from "./crypto";
import { GoogleAuthError } from "./google-calendar";
import { StorageUnavailableError } from "./firestore-store";

describe("classifyOAuthCallbackError", () => {
  it("names a missing Google client secret", () => {
    const err = new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.");
    expect(classifyOAuthCallbackError(err, "exchange", true)).toBe("missing_env_GOOGLE_CLIENT_SECRET");
  });

  it("surfaces Google's error code from the token endpoint", () => {
    const err = new GoogleAuthError(
      'Failed to exchange code for tokens: {"error": "redirect_uri_mismatch", "error_description": "Bad Request"}',
      400
    );
    expect(classifyOAuthCallbackError(err, "exchange", true)).toBe("google_redirect_uri_mismatch");
  });

  it("names a missing encryption secret", () => {
    const err = new MissingSecretError("GOOGLE_ENCRYPTION_SECRET environment variable is required in production.");
    expect(classifyOAuthCallbackError(err, "save", true)).toBe("missing_env_GOOGLE_ENCRYPTION_SECRET");
  });

  it("distinguishes missing Firestore config from a Firestore failure", () => {
    const err = new StorageUnavailableError("Durable write failed for credentials.enc");
    expect(classifyOAuthCallbackError(err, "save", false)).toBe("storage_not_configured");
    expect(classifyOAuthCallbackError(err, "save", true)).toBe("storage_firestore_failed");
  });

  it("falls back to a generic code per stage", () => {
    expect(classifyOAuthCallbackError(new Error("boom"), "exchange", true)).toBe("google_token_request_failed");
    expect(classifyOAuthCallbackError(new Error("boom"), "save", true)).toBe("save_credentials_failed");
  });
});
