/**
 * Maps a failure inside the Google OAuth callback to a short, non-secret code
 * that is safe to put in the `gcal_error` query param. A single generic
 * "token_exchange_failed" used to hide which of several unrelated problems
 * (missing env var, Google rejecting the code, storage not configured) broke
 * the connection.
 */
export function classifyOAuthCallbackError(
  err: unknown,
  stage: "exchange" | "save",
  firestoreConfigured: boolean
): string {
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err ?? "");

  if (name === "MissingSecretError") {
    if (message.includes("SESSION_SECRET")) return "missing_env_SESSION_SECRET";
    return "missing_env_GOOGLE_ENCRYPTION_SECRET";
  }

  if (message.includes("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing")) {
    return "missing_env_GOOGLE_CLIENT_SECRET";
  }

  if (stage === "exchange") {
    if (name === "GoogleAuthError") {
      // Google's token endpoint returns {"error":"invalid_grant", ...}.
      const match = message.match(/"error"\s*:\s*"([a-z_]+)"/i);
      return match ? `google_${match[1]}` : "google_token_request_failed";
    }
    return "google_token_request_failed";
  }

  if (name === "StorageUnavailableError") {
    return firestoreConfigured ? "storage_firestore_failed" : "storage_not_configured";
  }
  return "save_credentials_failed";
}
