export function redactUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    if (url.searchParams.has('key')) {
      url.searchParams.set('key', '[REDACTED]');
    }
    return url.toString();
  } catch {
    return String(urlString).replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');
  }
}

export function sanitizeErrorMessage(err: unknown): string {
  if (!err) {
    return 'unknown_error';
  }

  const message = String((err as { message?: unknown }).message || err);
  return message.replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');
}
