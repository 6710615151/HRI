import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminToken,
  credentialsMatch,
  verifyAdminToken
} from "../lib/admin-session";

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const keys = ["ADMIN_SESSION_SECRET", "ADMIN_BASIC_USER", "ADMIN_BASIC_PASSWORD"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)));
  return Promise.resolve(fn()).finally(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

test("a signed admin token verifies and carries the email", () =>
  withEnv({ ADMIN_SESSION_SECRET: "test-secret" }, async () => {
    const token = await createAdminToken("admin@example.com");
    const session = await verifyAdminToken(token);
    assert.equal(session?.email, "admin@example.com");
  }));

test("the old forgeable cookie value is rejected", () =>
  withEnv({ ADMIN_SESSION_SECRET: "test-secret" }, async () => {
    assert.equal(await verifyAdminToken("true"), null);
    assert.equal(await verifyAdminToken(undefined), null);
    assert.equal(await verifyAdminToken(""), null);
  }));

test("a tampered email or expiry invalidates the signature", () =>
  withEnv({ ADMIN_SESSION_SECRET: "test-secret" }, async () => {
    const [email, expiresAt, signature] = (await createAdminToken("admin@example.com")).split(".");
    const otherEmail = Buffer.from("attacker@example.com").toString("base64url");
    assert.equal(await verifyAdminToken(`${otherEmail}.${expiresAt}.${signature}`), null);
    assert.equal(await verifyAdminToken(`${email}.${Number(expiresAt) + 3600}.${signature}`), null);
  }));

test("a token signed with a different secret is rejected", () =>
  withEnv({ ADMIN_SESSION_SECRET: "secret-a" }, async () => {
    const token = await createAdminToken("admin@example.com");
    process.env.ADMIN_SESSION_SECRET = "secret-b";
    assert.equal(await verifyAdminToken(token), null);
  }));

test("tokens expire", () =>
  withEnv({ ADMIN_SESSION_SECRET: "test-secret" }, async () => {
    const issuedAt = 1_000_000;
    const token = await createAdminToken("admin@example.com", issuedAt);
    assert.ok(await verifyAdminToken(token, issuedAt + ADMIN_SESSION_MAX_AGE_SECONDS - 1));
    assert.equal(await verifyAdminToken(token, issuedAt + ADMIN_SESSION_MAX_AGE_SECONDS), null);
  }));

test("with no secret configured, sessions cannot be created or verified", () =>
  withEnv({}, async () => {
    await assert.rejects(() => createAdminToken("admin@example.com"));
    assert.equal(await verifyAdminToken("a.b.c"), null);
  }));

test("ADMIN_BASIC_PASSWORD is used as the signing key when no separate secret is set", () =>
  withEnv({ ADMIN_BASIC_PASSWORD: "pw-1" }, async () => {
    const token = await createAdminToken("admin@example.com");
    assert.ok(await verifyAdminToken(token));
    process.env.ADMIN_BASIC_PASSWORD = "pw-2"; // rotating the password ends existing sessions
    assert.equal(await verifyAdminToken(token), null);
  }));

test("credentials have no built-in defaults", () =>
  withEnv({}, () => {
    assert.equal(credentialsMatch("creativelab.co.th@gmail.com", "I@M_Cr3LabTH_F4M"), false);
    assert.equal(credentialsMatch("", ""), false);
  }));

test("credentials must match exactly, including passwords containing ':'", () =>
  withEnv({ ADMIN_BASIC_USER: "admin@example.com", ADMIN_BASIC_PASSWORD: "a:b:c" }, () => {
    assert.equal(credentialsMatch("admin@example.com", "a:b:c"), true);
    assert.equal(credentialsMatch("admin@example.com", "a:b"), false);
    assert.equal(credentialsMatch("other@example.com", "a:b:c"), false);
  }));
