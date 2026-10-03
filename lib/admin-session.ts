// Signed admin session tokens. Uses Web Crypto so it runs in both middleware (Edge) and server actions (Node).
// Token format: base64url(email).expiresAtSeconds.base64url(HMAC-SHA256(email.expiresAt))

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const encoder = new TextEncoder();

// The signing key comes from ADMIN_SESSION_SECRET, or ADMIN_BASIC_PASSWORD when no separate secret is set
// (so rotating the admin password also ends existing sessions). With neither set, admin sessions are disabled.
export function adminSessionSecret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_BASIC_PASSWORD || null;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

// Constant-time string comparison (avoids leaking how many leading characters matched).
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createAdminToken(email: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const secret = adminSessionSecret();
  if (!secret) throw new Error("Admin sessions are disabled: set ADMIN_SESSION_SECRET or ADMIN_BASIC_PASSWORD.");
  const encodedEmail = toBase64Url(encoder.encode(email));
  const expiresAt = nowSeconds + ADMIN_SESSION_MAX_AGE_SECONDS;
  const payload = `${encodedEmail}.${expiresAt}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifyAdminToken(token: string | undefined | null, nowSeconds = Math.floor(Date.now() / 1000)) {
  const secret = adminSessionSecret();
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedEmail, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isInteger(expiresAt) || expiresAt <= nowSeconds) return null;
  if (!safeEqual(signature, await sign(`${encodedEmail}.${expiresAtRaw}`, secret))) return null;
  try {
    return { email: new TextDecoder().decode(fromBase64Url(encodedEmail)), expiresAt };
  } catch {
    return null;
  }
}

// Basic-auth credentials for /api/ingest and /api/export. No built-in defaults: unset means locked.
export function adminCredentials() {
  const user = process.env.ADMIN_BASIC_USER;
  const password = process.env.ADMIN_BASIC_PASSWORD;
  return user && password ? { user, password } : null;
}

export function credentialsMatch(user: string, password: string) {
  const expected = adminCredentials();
  if (!expected) return false;
  // Evaluate both comparisons so timing does not reveal which one failed.
  const userOk = safeEqual(user, expected.user);
  const passwordOk = safeEqual(password, expected.password);
  return userOk && passwordOk;
}
