import crypto from "node:crypto";

/**
 * Server-side Firebase ID Token Verifier for Planorama.
 *
 * Implements Google's official public certificate verification for Firebase Authentication:
 * 1. Validates standard JWT format and algorithm (RS256).
 * 2. Fetches and caches Google's public X509 certificates for Firebase Auth.
 * 3. Verifies RSA-SHA256 signature against Google's public keys.
 * 4. Strictly validates issuer, audience, subject (UID), and expiration.
 * 5. Uses Node.js native crypto with zero additional third-party dependencies.
 */

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
}

export class FirebaseTokenVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseTokenVerificationError";
  }
}

interface CertificateCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let certCache: CertificateCache | null = null;

const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

/**
 * Fetch Google's public X509 certificates for securetoken.
 * Caches in memory according to the Cache-Control header.
 */
async function fetchGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.expiresAt > now) {
    return certCache.certs;
  }

  try {
    const response = await fetch(GOOGLE_CERTS_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch certificates: HTTP ${response.status}`);
    }

    const certs = (await response.json()) as Record<string, string>;

    // Parse Cache-Control max-age header (default 6 hours)
    let maxAgeMs = 6 * 60 * 60 * 1000;
    const cacheControl = response.headers.get("cache-control");
    if (cacheControl) {
      const match = cacheControl.match(/max-age=(\d+)/i);
      if (match && match[1]) {
        maxAgeMs = parseInt(match[1], 10) * 1000;
      }
    }

    certCache = {
      certs,
      expiresAt: now + maxAgeMs,
    };

    return certs;
  } catch (err) {
    if (certCache) {
      // Use stale cache if network error
      return certCache.certs;
    }
    throw new FirebaseTokenVerificationError(
      `Failed to fetch Google public certificates for Firebase ID token verification: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Base64URL decode helper.
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Verify a Firebase ID token cryptographically on the server.
 */
export async function verifyFirebaseIdToken(
  token: string,
  expectedProjectId?: string
): Promise<VerifiedFirebaseUser> {
  if (!token || typeof token !== "string") {
    throw new FirebaseTokenVerificationError("Token must be a non-empty string.");
  }

  // Allow fast-path mock tokens in unit test environment
  if (process.env.NODE_ENV === "test" && token.startsWith("mock_firebase_token_")) {
    const uid = token.replace("mock_firebase_token_", "");
    return {
      uid,
      email: `${uid}@example.com`,
      name: "Mock Firebase User",
      emailVerified: true,
    };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new FirebaseTokenVerificationError("Firebase ID token must have 3 dot-separated segments.");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; kid?: string; typ?: string };
  let payload: {
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    [key: string]: unknown;
  };

  try {
    header = JSON.parse(base64UrlDecode(headerB64));
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    throw new FirebaseTokenVerificationError("Malformed Firebase ID token encoding.");
  }

  // 1. Verify algorithm and key ID
  if (header.alg !== "RS256") {
    throw new FirebaseTokenVerificationError(
      `Firebase ID token has invalid algorithm: "${header.alg}". Expected RS256.`
    );
  }

  if (!header.kid) {
    throw new FirebaseTokenVerificationError("Firebase ID token header missing 'kid'.");
  }

  // 2. Resolve expected project ID
  const projectId =
    expectedProjectId ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "planoramaph";

  const nowSec = Math.floor(Date.now() / 1000);

  // 3. Verify standard claims
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIssuer) {
    throw new FirebaseTokenVerificationError(
      `Firebase ID token has incorrect issuer: "${payload.iss}". Expected "${expectedIssuer}".`
    );
  }

  if (payload.aud !== projectId) {
    throw new FirebaseTokenVerificationError(
      `Firebase ID token has incorrect audience: "${payload.aud}". Expected "${projectId}".`
    );
  }

  if (!payload.sub || typeof payload.sub !== "string" || payload.sub.trim().length === 0) {
    throw new FirebaseTokenVerificationError("Firebase ID token subject (sub) must be a non-empty UID string.");
  }

  if (!payload.exp || payload.exp <= nowSec) {
    throw new FirebaseTokenVerificationError("Firebase ID token has expired.");
  }

  // Allow up to 120s clock skew on issue and auth times
  if (payload.iat && payload.iat > nowSec + 120) {
    throw new FirebaseTokenVerificationError("Firebase ID token issued in the future.");
  }

  // 4. Test mode / emulator bypass check
  if (
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    (process.env.NODE_ENV === "test" && token.startsWith("mock_firebase_token_"))
  ) {
    return {
      uid: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified,
      name: payload.name,
      picture: payload.picture,
    };
  }

  // 5. Cryptographic signature verification using Google's public certs
  const certs = await fetchGooglePublicCerts();
  const cert = certs[header.kid];

  if (!cert) {
    // If cert not in cache, clear cache and retry once
    certCache = null;
    const freshCerts = await fetchGooglePublicCerts();
    const freshCert = freshCerts[header.kid];

    if (!freshCert) {
      throw new FirebaseTokenVerificationError(
        `No public key found for Firebase ID token kid: "${header.kid}".`
      );
    }

    return verifyWithCert(freshCert, `${headerB64}.${payloadB64}`, signatureB64, payload);
  }

  return verifyWithCert(cert, `${headerB64}.${payloadB64}`, signatureB64, payload);
}

function verifyWithCert(
  cert: string,
  data: string,
  signatureB64: string,
  payload: {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  }
): VerifiedFirebaseUser {
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(data);

  let base64Sig = signatureB64.replace(/-/g, "+").replace(/_/g, "/");
  while (base64Sig.length % 4) {
    base64Sig += "=";
  }

  const isValid = verifier.verify(cert, base64Sig, "base64");
  if (!isValid) {
    throw new FirebaseTokenVerificationError("Firebase ID token signature verification failed.");
  }

  return {
    uid: payload.sub!,
    email: payload.email,
    emailVerified: payload.email_verified,
    name: payload.name,
    picture: payload.picture,
  };
}
