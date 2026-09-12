// _shared/crypto.ts
// AES-256-GCM encryption/decrypt for marketplace credentials.
// Encryption key stored in Supabase secrets (MARKETPLACE_ENCRYPTION_KEY).

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;

function getEncryptionKey(): Promise<CryptoKey> {
  const rawKey = Deno.env.get("MARKETPLACE_ENCRYPTION_KEY");
  if (!rawKey) {
    throw new Error("MARKETPLACE_ENCRYPTION_KEY secret not set");
  }
  // Derive a 256-bit key from the hex string
  const keyBytes = new Uint8Array(
    rawKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  return crypto.subtle.importKey("raw", keyBytes, { name: ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );

  // Combine IV + ciphertext and base64 encode
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encryptedBase64: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encryptedBase64), (c) =>
    c.charCodeAt(0)
  );

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
