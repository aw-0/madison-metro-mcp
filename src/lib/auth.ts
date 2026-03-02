type ToolCallParamsLike = {
  authorization?: unknown;
  _meta?: {
    authorization?: unknown;
  };
  arguments?: {
    authorization?: unknown;
    _meta?: {
      authorization?: unknown;
    };
  };
};

type HeaderValue = string | string[] | undefined;
type HeaderMap = Record<string, HeaderValue>;

export function extractBearerToken(rawAuth: unknown): string | undefined {
  if (!rawAuth || typeof rawAuth !== 'string') {
    return undefined;
  }

  const trimmed = rawAuth.trim();
  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return undefined;
  }

  const token = match[1].trim();
  return token.length > 0 ? token : undefined;
}

export function extractMetroApiKeyFromToolCall(params: ToolCallParamsLike = {}): string | undefined {
  const direct = [
    params?.authorization,
    params?._meta?.authorization,
    params?.arguments?.authorization,
    params?.arguments?._meta?.authorization
  ];

  for (const candidate of direct) {
    const token = extractBearerToken(candidate);
    if (token) {
      return token;
    }
  }

  return undefined;
}

export function extractMetroApiKeyFromHeaders(headers: HeaderMap | undefined): string | undefined {
  if (!headers) {
    return undefined;
  }

  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== 'authorization') {
      continue;
    }

    const normalized = Array.isArray(value) ? value[0] : value;
    const token = extractBearerToken(normalized);
    if (token) {
      return token;
    }
  }

  return undefined;
}
