export function extractBearerToken(rawAuth) {
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

export function extractMetroApiKeyFromToolCall(params = {}) {
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
