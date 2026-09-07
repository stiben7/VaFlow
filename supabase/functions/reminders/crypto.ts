// AES-256-GCM for the provider secret (SMTP password / Resend API key).
//
// The key is EMAIL_ENC_KEY -- 32 random bytes, base64 -- set as an Edge
// Function secret. It never leaves the function runtime. The ciphertext in
// public.user_email_config is inert without it.
//
// NOTE: this file is duplicated verbatim in ../reminders/crypto.ts. Edge
// Functions bundle per-directory, so shared code has to be copied (same as
// the copied formatTime in ../reminders/util.ts). Keep them in sync.

const b64ToBytes = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const raw = b64ToBytes(Deno.env.get("EMAIL_ENC_KEY") ?? "");
    if (raw.length !== 32) {
      throw new Error("EMAIL_ENC_KEY must be 32 bytes, base64-encoded");
    }
    keyPromise = crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  }
  return keyPromise;
}

export async function encryptSecret(
  plaintext: string,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const key = await getKey();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: new Uint8Array(buf), nonce };
}

export async function decryptSecret(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<string> {
  const key = await getKey();
  const buf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(buf);
}

/**
 * Postgres BYTEA comes back from PostgREST as a hex string like `\x0a1b...`.
 * Turn that into bytes for decryptSecret().
 */
export function pgByteaToBytes(v: string): Uint8Array {
  const hex = v.startsWith("\\x") ? v.slice(2) : v;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

/** Bytes -> `\x...` hex literal for writing BYTEA back through PostgREST. */
export function bytesToPgBytea(b: Uint8Array): string {
  let hex = "";
  for (const byte of b) hex += byte.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}
