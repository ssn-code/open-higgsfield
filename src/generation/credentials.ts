export type ProviderType = "nvidia" | "higgsfield";

export type StoredCredentials = {
  apiKey: string;
  provider: ProviderType;
  baseUrl?: string;
};

export const PLATFORM_KEY_COOKIE = "api_key";

export const PLATFORM_KEY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export class MissingCredentialsError extends Error {
  constructor() {
    super("Missing API key");
    this.name = "MissingCredentialsError";
  }
}

export function isNvidiaKey(apiKey: string): boolean {
  return apiKey.startsWith("nvapi-") || !apiKey.includes(":");
}

export function detectProvider(apiKey: string): ProviderType {
  return isNvidiaKey(apiKey) ? "nvidia" : "higgsfield";
}

export function encodeCredentials(
  apiKey: string,
  provider?: ProviderType,
  baseUrl?: string,
): string {
  const resolvedProvider = provider ?? detectProvider(apiKey);
  return JSON.stringify({
    apiKey,
    provider: resolvedProvider,
    baseUrl: baseUrl?.trim() || undefined,
  });
}

export function decodeCredentials(raw: string | undefined): StoredCredentials | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as { apiKey?: unknown; provider?: unknown; baseUrl?: unknown };
    const apiKey = record.apiKey;
    if (typeof apiKey !== "string" || !apiKey.trim()) return null;
    const cleanKey = apiKey.trim();
    const provider: ProviderType =
      record.provider === "nvidia" || record.provider === "higgsfield"
        ? record.provider
        : detectProvider(cleanKey);
    const baseUrl =
      typeof record.baseUrl === "string" && record.baseUrl.trim()
        ? record.baseUrl.trim()
        : undefined;

    return { apiKey: cleanKey, provider, baseUrl };
  } catch {
    return null;
  }
}

export function parseCredentialInput(data: unknown): StoredCredentials {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Enter an API key");
  }
  const record = data as {
    apiKey?: unknown;
    api_key?: unknown;
    provider?: unknown;
    baseUrl?: unknown;
    base_url?: unknown;
  };
  const apiKey = record.apiKey ?? record.api_key;
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("Enter an API key");
  const cleanKey = apiKey.trim();

  const explicitProvider = record.provider;
  const provider: ProviderType =
    explicitProvider === "nvidia" || explicitProvider === "higgsfield"
      ? explicitProvider
      : detectProvider(cleanKey);

  const rawBase = record.baseUrl ?? record.base_url;
  const baseUrl =
    typeof rawBase === "string" && rawBase.trim() ? rawBase.trim() : undefined;

  return { apiKey: cleanKey, provider, baseUrl };
}

export function toAuthorizationHeader(apiKey: string, provider?: ProviderType): string {
  const isNv = provider ? provider === "nvidia" : isNvidiaKey(apiKey);
  if (isNv) {
    return `Bearer ${apiKey.trim()}`;
  }
  return `Key ${apiKey.trim()}`;
}

