const FALLBACK_PREFIX = "answer";

/**
 * Generate a unique identifier for an answer that can be shared via URL.
 * Tries to use the most robust randomness available in the current runtime.
 */
export function generateAnswerId(): string {
  if (typeof globalThis !== "undefined") {
    const cryptoObj = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
    if (cryptoObj?.randomUUID) {
      return cryptoObj.randomUUID();
    }

    if (cryptoObj?.getRandomValues) {
      const array = new Uint32Array(4);
      cryptoObj.getRandomValues(array);
      return Array.from(array, (value) => value.toString(16).padStart(8, "0")).join("");
    }
  }

  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${FALLBACK_PREFIX}-${timestamp}-${random}`;
}


