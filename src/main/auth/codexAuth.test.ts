import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CodexAuthService, type CodexTokenCodec, createCodexTokenCodec } from "./codexAuth";

async function tempAuthPath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "hibit-auth-"));
  return join(root, "auth", "codex.json");
}

describe("CodexAuthService", () => {
  it("reports signed out status when no credential file exists", async () => {
    const authPath = await tempAuthPath();
    const service = new CodexAuthService({ authPath });

    await expect(service.status()).resolves.toMatchObject({
      authenticated: false,
      storage: { path: authPath, encrypted: false },
    });
  });

  it("stores credentials under the Hi-Bit auth path with restrictive permissions", async () => {
    const authPath = await tempAuthPath();
    const service = new CodexAuthService({ authPath, now: () => new Date("2026-01-02T03:04:05Z") });

    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 2_000, chatgpt_account_id: "acct-123" }),
      refreshToken: "refresh-token",
    });

    await expect(service.status()).resolves.toMatchObject({
      authenticated: true,
      accountId: "acct-123",
      expiresAt: "1970-01-01T00:33:20.000Z",
    });
    const file = JSON.parse(await readFile(authPath, "utf8"));
    expect(file).toMatchObject({
      version: 1,
      encrypted: false,
      updatedAt: "2026-01-02T03:04:05.000Z",
    });
    const mode = (await stat(authPath)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("refreshes expiring access tokens before returning them to Pi", async () => {
    const authPath = await tempAuthPath();
    const service = new CodexAuthService({
      authPath,
      now: () => new Date(900_000),
      fetchFn: (async () =>
        Response.json({
          access_token: jwtWithPayload({ exp: 2_000, chatgpt_account_id: "acct-new" }),
          refresh_token: "refresh-new",
        })) as typeof fetch,
    });
    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 1_000, chatgpt_account_id: "acct-old" }),
      refreshToken: "refresh-old",
    });

    await expect(service.getFreshAccessToken()).resolves.toBe(
      jwtWithPayload({ exp: 2_000, chatgpt_account_id: "acct-new" }),
    );
    await expect(service.status()).resolves.toMatchObject({
      authenticated: true,
      accountId: "acct-new",
    });
  });

  it("asks to connect Codex when Bit needs a provider token", async () => {
    const authPath = await tempAuthPath();
    const service = new CodexAuthService({ authPath });

    await expect(service.getFreshAccessToken()).rejects.toThrow(
      "Connect Codex before starting Bit.",
    );
  });

  it("uses the configured codec for token-at-rest protection", async () => {
    const authPath = await tempAuthPath();
    const codec: CodexTokenCodec = {
      encrypted: true,
      encrypt: (value) => `box:${Buffer.from(value).toString("base64url")}`,
      decrypt: (value) => Buffer.from(value.replace(/^box:/, ""), "base64url").toString("utf8"),
    };
    const service = new CodexAuthService({ authPath, codec, now: () => new Date(0) });

    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 2_000 }),
      refreshToken: "refresh",
    });

    const raw = await readFile(authPath, "utf8");
    const stored = JSON.parse(raw) as { refreshToken: string };
    expect(stored.refreshToken).not.toBe("refresh");
    await expect(service.getFreshAccessToken()).resolves.toBe(jwtWithPayload({ exp: 2_000 }));
  });

  it("writes tokens as plaintext so the OS keychain is never touched on startup", async () => {
    const authPath = await tempAuthPath();
    const codec = createCodexTokenCodec({
      isEncryptionAvailable: () => true,
      decryptString: () => {
        throw new Error("decryptString must not be called for fresh logins");
      },
    });
    const service = new CodexAuthService({ authPath, codec, now: () => new Date(0) });

    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 2_000 }),
      refreshToken: "refresh",
    });

    const stored = JSON.parse(await readFile(authPath, "utf8"));
    expect(stored).toMatchObject({ encrypted: false, refreshToken: "refresh" });
    await expect(service.getFreshAccessToken()).resolves.toBe(jwtWithPayload({ exp: 2_000 }));
  });

  it("migrates a legacy keychain-encrypted file to plaintext on first load", async () => {
    const authPath = await tempAuthPath();
    let decryptCalls = 0;
    const codec = createCodexTokenCodec({
      isEncryptionAvailable: () => true,
      decryptString: (value) => {
        decryptCalls += 1;
        return value.toString("utf8");
      },
    });
    const service = new CodexAuthService({ authPath, codec, now: () => new Date(0) });

    const accessToken = jwtWithPayload({ exp: 2_000, chatgpt_account_id: "acct-legacy" });
    await mkdir(dirname(authPath), { recursive: true });
    await writeFile(
      authPath,
      JSON.stringify({
        version: 1,
        encrypted: true,
        accessToken: Buffer.from(accessToken).toString("base64"),
        refreshToken: Buffer.from("legacy-refresh").toString("base64"),
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    await expect(service.status()).resolves.toMatchObject({
      authenticated: true,
      accountId: "acct-legacy",
    });

    const migrated = JSON.parse(await readFile(authPath, "utf8"));
    expect(migrated).toMatchObject({
      encrypted: false,
      accessToken,
      refreshToken: "legacy-refresh",
    });

    const callsAfterMigration = decryptCalls;
    await service.status();
    expect(decryptCalls).toBe(callsAfterMigration);
  });

  it("does not rewrite legacy keychain-encrypted credentials when decryption is unavailable", async () => {
    const authPath = await tempAuthPath();
    const codec = createCodexTokenCodec({
      isEncryptionAvailable: () => false,
      decryptString: () => {
        throw new Error("decryptString must not be called without safeStorage");
      },
    });
    const service = new CodexAuthService({ authPath, codec });
    const legacyCredential = {
      version: 1,
      encrypted: true,
      accessToken: Buffer.from(jwtWithPayload({ exp: 2_000 })).toString("base64"),
      refreshToken: Buffer.from("legacy-refresh").toString("base64"),
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await mkdir(dirname(authPath), { recursive: true });
    await writeFile(authPath, JSON.stringify(legacyCredential));

    await expect(service.status()).resolves.toMatchObject({
      authenticated: false,
      error: "Cannot decrypt legacy Codex auth file because OS keychain access is unavailable.",
    });

    await expect(readFile(authPath, "utf8")).resolves.toBe(JSON.stringify(legacyCredential));
  });

  it("logs out by removing the app-owned auth file", async () => {
    const authPath = await tempAuthPath();
    const service = new CodexAuthService({ authPath });
    await service.saveTokenPair({
      accessToken: jwtWithPayload({ exp: 2_000 }),
      refreshToken: "refresh",
    });

    await service.logout();

    await expect(service.status()).resolves.toMatchObject({ authenticated: false });
  });
});

function jwtWithPayload(payload: unknown): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}
