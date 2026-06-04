export type AuthStorageInfo = {
  path: string;
  encrypted: boolean;
  warning?: string;
};

export type AuthStatus = {
  authenticated: boolean;
  accountId?: string;
  expiresAt?: string;
  storage: AuthStorageInfo;
  error?: string;
};
