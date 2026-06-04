import { rm } from "node:fs/promises";
import type { AuthStatus } from "@shared/auth";
import { readJsonFile, writeJsonFile } from "../storage/json";
import {
  buildCodexAuthorizationUrl,
  type CodexTokenPair,
  codexAccessTokenIsExpiring,
  createCodexOAuthState,
  createCodexPkce,
  exchangeCodexAuthorizationCode,
  extractCodexAccountId,
  getCodexAccessTokenExpiry,
  refreshCodexTokens,
  startCodexOAuthCallbackServer,
} from "./codexOAuth";

export type CodexTokenCodec = {
  encrypted: boolean;
  warning?: string;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
};

export type CodexCredential = {
  accessToken: string;
  refreshToken: string;
  accountId?: string;
  expiresAt?: string;
  updatedAt: string;
};

type StoredCodexCredential = {
  version: 1;
  encrypted: boolean;
  accessToken: string;
  refreshToken: string;
  accountId?: string;
  expiresAt?: string;
  updatedAt: string;
};

type CodexAuthServiceOptions = {
  authPath: string;
  codec?: CodexTokenCodec;
  fetchFn?: typeof fetch;
  openExternal?: (url: string) => Promise<unknown>;
  now?: () => Date;
  callbackTimeoutMs?: number;
};

export const plainCodexTokenCodec: CodexTokenCodec = {
  encrypted: false,
  warning: "Codex tokens are stored in a local file because secure storage is unavailable.",
  encrypt: (value) => value,
  decrypt: (value) => value,
};

export class CodexAuthService {
  private readonly authPath: string;
  private readonly codec: CodexTokenCodec;
  private readonly fetchFn: typeof fetch;
  private readonly openExternal: (url: string) => Promise<unknown>;
  private readonly now: () => Date;
  private readonly callbackTimeoutMs: number;

  constructor(options: CodexAuthServiceOptions) {
    this.authPath = options.authPath;
    this.codec = options.codec ?? plainCodexTokenCodec;
    this.fetchFn = options.fetchFn ?? fetch;
    this.openExternal = options.openExternal ?? (async () => undefined);
    this.now = options.now ?? (() => new Date());
    this.callbackTimeoutMs = options.callbackTimeoutMs ?? 5 * 60_000;
  }

  async status(): Promise<AuthStatus> {
    try {
      const credential = await this.loadCredential();
      if (!credential) {
        return {
          authenticated: false,
          storage: this.storageInfo(),
        };
      }
      return {
        authenticated: true,
        accountId: credential.accountId,
        expiresAt: credential.expiresAt,
        storage: this.storageInfo(),
      };
    } catch (error) {
      return {
        authenticated: false,
        storage: this.storageInfo(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async login(): Promise<AuthStatus> {
    const state = createCodexOAuthState();
    const pkce = await createCodexPkce();
    const callbackServer = await startCodexOAuthCallbackServer({
      state,
      timeoutMs: this.callbackTimeoutMs,
    });

    try {
      const authorizationUrl = buildCodexAuthorizationUrl({
        redirectUri: callbackServer.redirectUri,
        codeChallenge: pkce.codeChallenge,
        state,
      });
      await this.openExternal(authorizationUrl);
      const code = await callbackServer.waitForCode();
      const tokenPair = await exchangeCodexAuthorizationCode(
        {
          code,
          redirectUri: callbackServer.redirectUri,
          codeVerifier: pkce.codeVerifier,
        },
        this.fetchFn,
      );
      await this.saveTokenPair(tokenPair);
      return this.status();
    } finally {
      await callbackServer.close();
    }
  }

  async logout(): Promise<void> {
    await rm(this.authPath, { force: true });
  }

  async getFreshAccessToken(): Promise<string> {
    const credential = await this.loadCredential();
    if (!credential) {
      throw new Error("Connect Codex before starting Bit.");
    }

    if (!codexAccessTokenIsExpiring(credential.accessToken, this.now().getTime())) {
      return credential.accessToken;
    }

    const refreshed = await refreshCodexTokens(credential.refreshToken, this.fetchFn);
    const next = await this.saveTokenPair(refreshed);
    return next.accessToken;
  }

  async saveTokenPair(tokenPair: CodexTokenPair): Promise<CodexCredential> {
    const credential: CodexCredential = {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      accountId: extractCodexAccountId(tokenPair.accessToken),
      expiresAt: getCodexAccessTokenExpiry(tokenPair.accessToken),
      updatedAt: this.now().toISOString(),
    };
    await this.writeCredential(credential);
    return credential;
  }

  async loadCredential(): Promise<CodexCredential | null> {
    const stored = await readJsonFile<StoredCodexCredential>(this.authPath);
    if (!stored) return null;
    if (stored.version !== 1) {
      throw new Error("Unsupported Codex auth file version.");
    }
    if (typeof stored.accessToken !== "string" || typeof stored.refreshToken !== "string") {
      throw new Error("Codex auth file is missing tokens.");
    }

    const accessToken = stored.encrypted
      ? this.codec.decrypt(stored.accessToken)
      : stored.accessToken;
    const refreshToken = stored.encrypted
      ? this.codec.decrypt(stored.refreshToken)
      : stored.refreshToken;
    if (!accessToken || !refreshToken) {
      throw new Error("Codex auth file is missing tokens.");
    }

    return {
      accessToken,
      refreshToken,
      accountId: stored.accountId ?? extractCodexAccountId(accessToken),
      expiresAt: stored.expiresAt ?? getCodexAccessTokenExpiry(accessToken),
      updatedAt: stored.updatedAt,
    };
  }

  private async writeCredential(credential: CodexCredential): Promise<void> {
    const stored: StoredCodexCredential = {
      version: 1,
      encrypted: this.codec.encrypted,
      accessToken: this.codec.encrypted
        ? this.codec.encrypt(credential.accessToken)
        : credential.accessToken,
      refreshToken: this.codec.encrypted
        ? this.codec.encrypt(credential.refreshToken)
        : credential.refreshToken,
      accountId: credential.accountId,
      expiresAt: credential.expiresAt,
      updatedAt: credential.updatedAt,
    };
    await writeJsonFile(this.authPath, stored, { mode: 0o600 });
  }

  private storageInfo(): AuthStatus["storage"] {
    return {
      path: this.authPath,
      encrypted: this.codec.encrypted,
      warning: this.codec.encrypted ? undefined : this.codec.warning,
    };
  }
}

export function createSafeStorageTokenCodec(options: {
  isEncryptionAvailable: () => boolean;
  encryptString: (value: string) => Buffer;
  decryptString: (value: Buffer) => string;
}): CodexTokenCodec {
  if (!options.isEncryptionAvailable()) {
    return plainCodexTokenCodec;
  }
  return {
    encrypted: true,
    encrypt: (value) => options.encryptString(value).toString("base64"),
    decrypt: (value) => options.decryptString(Buffer.from(value, "base64")),
  };
}
