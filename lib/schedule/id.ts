/**
 * Reliable, cross-platform UUID generator.
 *
 * Supported environments:
 * - Secure browser contexts (HTTPS, localhost) with native crypto.randomUUID()
 * - Insecure browser contexts (e.g. LAN IP addresses like http://192.168.x.x) where
 *   crypto.randomUUID() is undefined but crypto.getRandomValues() is available
 * - Node.js and testing environments
 * - Fallback with monotonic timestamp + performance timer + sequence counter + entropy
 */

let sequence = 0;

export function generateId(): string {
  // 1. Prefer native crypto.randomUUID() when available in secure contexts
  try {
    const globalCrypto = typeof crypto !== "undefined" ? crypto : (typeof window !== "undefined" ? window.crypto : undefined);
    if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
      return globalCrypto.randomUUID();
    }
  } catch {
    // Continue to fallback
  }

  // 2. Fallback to crypto.getRandomValues() (works on HTTP / insecure contexts)
  try {
    const globalCrypto = typeof crypto !== "undefined" ? crypto : (typeof window !== "undefined" ? window.crypto : undefined);
    if (globalCrypto && typeof globalCrypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      globalCrypto.getRandomValues(bytes);
      // Set UUID v4 version (0100xxxx)
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      // Set UUID variant (10xxxxxx)
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }
  } catch {
    // Continue to explicit non-crypto fallback
  }

  // 3. Fallback when secure randomness is completely unavailable.
  // Combines wall clock, performance microsecond timer, monotonic counter, and Math.random entropy
  // to explicitly avoid collisions.
  const time = Date.now();
  const perf = typeof performance !== "undefined" && typeof performance.now === "function" ? Math.floor(performance.now() * 1000) : 0;
  sequence = (sequence + 1) & 0xffff;

  const r1 = Math.floor(Math.random() * 0xffffffff);
  const r2 = Math.floor(Math.random() * 0xffffffff);
  const r3 = Math.floor(Math.random() * 0xffffffff);

  const p1 = ((time ^ r1) >>> 0).toString(16).padStart(8, "0");
  const p2 = (((perf >>> 8) ^ sequence) & 0xffff).toString(16).padStart(4, "0");
  const p3 = (0x4000 | (r2 & 0x0fff)).toString(16).padStart(4, "0");
  const p4 = (0x8000 | (r3 & 0x3fff)).toString(16).padStart(4, "0");
  const p5 = (((r2 >>> 16) ^ r3) >>> 0).toString(16).padStart(8, "0") + (sequence & 0xffff).toString(16).padStart(4, "0");

  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}
