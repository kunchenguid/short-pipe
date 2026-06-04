import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

export const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const CODEX_OAUTH_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
export const CODEX_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
export const CODEX_ACCESS_TOKEN_REFRESH_SKEW_MS = 120_000;
export const CODEX_OAUTH_CALLBACK_PORT = 1455;
export const CODEX_OAUTH_SCOPE =
  "openid profile email offline_access api.connectors.read api.connectors.invoke";

export type CodexPkce = {
  codeVerifier: string;
  codeChallenge: string;
};

export type CodexTokenPair = {
  accessToken: string;
  refreshToken: string;
};

export async function createCodexPkce(
  randomBytesFn: (size: number) => Buffer = randomBytes,
): Promise<CodexPkce> {
  const codeVerifier = randomBytesFn(64).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function createCodexOAuthState(
  randomBytesFn: (size: number) => Buffer = randomBytes,
): string {
  return randomBytesFn(32).toString("base64url");
}

export function buildCodexAuthorizationUrl({
  redirectUri,
  codeChallenge,
  state,
}: {
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL(CODEX_OAUTH_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CODEX_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: CODEX_OAUTH_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "codex_cli_rs",
  }).toString();
  return url.toString();
}

export async function exchangeCodexAuthorizationCode(
  {
    code,
    redirectUri,
    codeVerifier,
  }: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  },
  fetchFn: typeof fetch = fetch,
): Promise<CodexTokenPair> {
  const response = await fetchFn(CODEX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: CODEX_OAUTH_CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });

  return readCodexTokenResponse(response, {
    httpFailureMessage: "Codex connection failed",
    missingAccessTokenMessage: "Codex connection response was missing access_token",
  });
}

export async function refreshCodexTokens(
  refreshToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<CodexTokenPair> {
  const cleanRefreshToken = cleanString(refreshToken);
  if (!cleanRefreshToken) {
    throw new Error("Codex refresh token is missing");
  }

  const response = await fetchFn(CODEX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cleanRefreshToken,
      client_id: CODEX_OAUTH_CLIENT_ID,
    }),
  });

  return readCodexTokenResponse(response, {
    fallbackRefreshToken: cleanRefreshToken,
    httpFailureMessage: "Codex token refresh failed",
    missingAccessTokenMessage: "Codex token refresh response was missing access_token",
  });
}

export function codexAccessTokenIsExpiring(accessToken: string, nowMs = Date.now()): boolean {
  const exp = decodeJwtPayload(accessToken)?.exp;
  return typeof exp !== "number" || exp * 1000 <= nowMs + CODEX_ACCESS_TOKEN_REFRESH_SKEW_MS;
}

export function extractCodexAccountId(accessToken: string): string | undefined {
  const claims = decodeJwtPayload(accessToken);
  return (
    cleanString(claims?.chatgpt_account_id) ??
    cleanString(claims?.["https://api.openai.com/auth"]?.chatgpt_account_id)
  );
}

export function getCodexAccessTokenExpiry(accessToken: string): string | undefined {
  const exp = decodeJwtPayload(accessToken)?.exp;
  return typeof exp === "number" ? new Date(exp * 1000).toISOString() : undefined;
}

type JwtClaims = Record<string, unknown> & {
  chatgpt_account_id?: unknown;
  exp?: unknown;
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: unknown;
  };
};

export function decodeJwtPayload(token: string): JwtClaims | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as unknown;
    return payload && typeof payload === "object" ? (payload as JwtClaims) : undefined;
  } catch {
    return undefined;
  }
}

async function readCodexTokenResponse(
  response: Response,
  {
    fallbackRefreshToken = "",
    httpFailureMessage,
    missingAccessTokenMessage,
  }: {
    fallbackRefreshToken?: string;
    httpFailureMessage: string;
    missingAccessTokenMessage: string;
  },
): Promise<CodexTokenPair> {
  if (!response.ok) {
    throw new Error(`${httpFailureMessage} with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    access_token?: unknown;
    refresh_token?: unknown;
  };
  const accessToken = cleanString(payload.access_token);
  if (!accessToken) {
    throw new Error(missingAccessTokenMessage);
  }
  const refreshToken = cleanString(payload.refresh_token) ?? fallbackRefreshToken;
  if (!refreshToken) {
    throw new Error("Codex refresh token is missing");
  }

  return { accessToken, refreshToken };
}

export type CodexOAuthCallbackServer = {
  redirectUri: string;
  waitForCode: () => Promise<string>;
  close: () => Promise<void>;
};

export async function startCodexOAuthCallbackServer({
  state,
  port = CODEX_OAUTH_CALLBACK_PORT,
  timeoutMs = 5 * 60_000,
}: {
  state: string;
  port?: number;
  timeoutMs?: number;
}): Promise<CodexOAuthCallbackServer> {
  let server: Server | undefined;
  let settle: ((result: string) => void) | undefined;
  let reject: ((error: Error) => void) | undefined;
  const waitPromise = new Promise<string>((resolve, rejectPromise) => {
    settle = resolve;
    reject = rejectPromise;
  });

  const timer = setTimeout(() => {
    reject?.(new Error("Codex connection timed out"));
    void closeServer(server);
  }, timeoutMs);

  server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname !== "/auth/callback") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found");
      return;
    }

    const returnedState = requestUrl.searchParams.get("state");
    const code = cleanString(requestUrl.searchParams.get("code"));
    const error = cleanString(requestUrl.searchParams.get("error"));
    if (returnedState !== state) {
      response.writeHead(400, { "content-type": "text/html" });
      response.end("<h1>Codex connection did not match.</h1><p>You can close this tab.</p>");
      reject?.(new Error("Codex connection state did not match"));
      return;
    }
    if (error) {
      response.writeHead(400, { "content-type": "text/html" });
      response.end("<h1>Codex connection was cancelled.</h1><p>You can close this tab.</p>");
      reject?.(new Error(`Codex connection failed: ${error}`));
      return;
    }
    if (!code) {
      response.writeHead(400, { "content-type": "text/html" });
      response.end("<h1>Codex connection missed the code.</h1><p>You can close this tab.</p>");
      reject?.(new Error("Codex connection callback did not include a code"));
      return;
    }

    response.writeHead(200, { "content-type": "text/html" });
    response.end("<h1>Codex is connected.</h1><p>You can close this tab and return to Hi-Bit.</p>");
    clearTimeout(timer);
    settle?.(code);
    void closeServer(server);
  });

  await new Promise<void>((resolve, rejectListen) => {
    server?.once("error", rejectListen);
    server?.listen(port, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Codex connection callback server did not start");
  }

  return {
    redirectUri: `http://localhost:${address.port}/auth/callback`,
    waitForCode: () => waitPromise,
    close: async () => {
      clearTimeout(timer);
      await closeServer(server);
    },
  };
}

function closeServer(server: Server | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
