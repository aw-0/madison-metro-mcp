export function redactUrl(urlString) {
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

export function sanitizeErrorMessage(err) {
  if (!err) {
    return 'unknown_error';
  }

  const message = String(err.message || err);
  return message.replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');
}
