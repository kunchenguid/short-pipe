import { describe, expect, it } from "vitest";
import {
  buildCodexAuthorizationUrl,
  codexAccessTokenIsExpiring,
  exchangeCodexAuthorizationCode,
  extractCodexAccountId,
  refreshCodexTokens,
  startCodexOAuthCallbackServer,
} from "./codexOAuth";

describe("buildCodexAuthorizationUrl", () => {
  it("uses the Hi-Bit owned Codex OAuth client and PKCE parameters", () => {
    const url = new URL(
      buildCodexAuthorizationUrl({
        redirectUri: "http://127.0.0.1:1455/auth/callback",
        codeChallenge: "challenge-123",
        state: "state-123",
      }),
    );

    expect(url.origin).toBe("https://auth.openai.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe(
      "openid profile email offline_access api.connectors.read api.connectors.invoke",
    );
    expect(url.searchParams.get("codex_cli_simplified_flow")).toBe("true");
  });
});

describe("startCodexOAuthCallbackServer", () => {
  it("uses the Codex-registered localhost callback by default", async () => {
    const server = await startCodexOAuthCallbackServer({ state: "state-123", timeoutMs: 1_000 });

    try {
      expect(server.redirectUri).toBe("http://localhost:1455/auth/callback");
    } finally {
      await server.close();
    }
  });

  it("describes callback completion as a Codex connection", async () => {
    const server = await startCodexOAuthCallbackServer({ state: "state-123", timeoutMs: 1_000 });

    try {
      const response = await fetch(`${server.redirectUri}?state=state-123&code=code-123`);

      await expect(response.text()).resolves.toContain("Codex is connected");
      await expect(server.waitForCode()).resolves.toBe("code-123");
    } finally {
      await server.close();
    }
  });
});

describe("Codex JWT helpers", () => {
  it("extracts account ids from both known claim shapes", () => {
    expect(extractCodexAccountId(jwtWithPayload({ chatgpt_account_id: "acct-top" }))).toBe(
      "acct-top",
    );
    expect(
      extractCodexAccountId(
        jwtWithPayload({
          "https://api.openai.com/auth": { chatgpt_account_id: "acct-nested" },
        }),
      ),
    ).toBe("acct-nested");
  });

  it("uses a 120 second refresh skew", () => {
    const expiring = jwtWithPayload({ exp: 1_000 });
    const valid = jwtWithPayload({ exp: 2_000 });

    expect(codexAccessTokenIsExpiring(expiring, 900_000)).toBe(true);
    expect(codexAccessTokenIsExpiring(valid, 900_000)).toBe(false);
    expect(codexAccessTokenIsExpiring("not-a-jwt", 900_000)).toBe(true);
  });
});

describe("Codex token endpoint helpers", () => {
  it("exchanges authorization codes with PKCE", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return Response.json({ access_token: "access", refresh_token: "refresh" });
    };

    await expect(
      exchangeCodexAuthorizationCode(
        {
          code: "code-123",
          redirectUri: "http://127.0.0.1:1455/auth/callback",
          codeVerifier: "verifier-123",
        },
        fetchFn as typeof fetch,
      ),
    ).resolves.toEqual({ accessToken: "access", refreshToken: "refresh" });

    expect(calls[0].url).toBe("https://auth.openai.com/oauth/token");
    expect(calls[0].body).toContain("grant_type=authorization_code");
    expect(calls[0].body).toContain("code=code-123");
    expect(calls[0].body).toContain("code_verifier=verifier-123");
  });

  it("refreshes tokens and preserves the old refresh token when the response omits one", async () => {
    const calls: string[] = [];
    const fetchFn = async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(init?.body));
      return Response.json({ access_token: "new-access" });
    };

    await expect(refreshCodexTokens("old-refresh", fetchFn as typeof fetch)).resolves.toEqual({
      accessToken: "new-access",
      refreshToken: "old-refresh",
    });
    expect(calls[0]).toContain("grant_type=refresh_token");
    expect(calls[0]).toContain("refresh_token=old-refresh");
  });

  it("reports HTTP failures without exposing token values", async () => {
    const fetchFn = async () => new Response("{}", { status: 500 });

    await expect(refreshCodexTokens("secret-refresh", fetchFn as typeof fetch)).rejects.toThrow(
      /Codex token refresh failed with HTTP 500/,
    );
  });
});

function jwtWithPayload(payload: unknown): string {
  return [
    base64UrlEncode(JSON.stringify({ alg: "none" })),
    base64UrlEncode(JSON.stringify(payload)),
    "signature",
  ].join(".");
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
