import { expect, test } from 'bun:test';
import { extractBearerToken, extractMetroApiKeyFromHeaders, extractMetroApiKeyFromToolCall } from '../src/lib/auth.js';

test('extractBearerToken returns token for standard bearer header', () => {
  expect(extractBearerToken('Bearer abc123')).toBe('abc123');
});

test('extractBearerToken returns undefined for non-bearer input', () => {
  expect(extractBearerToken('Token abc123')).toBeUndefined();
});

test('extractMetroApiKeyFromToolCall checks metadata and arguments', () => {
  const token = extractMetroApiKeyFromToolCall({
    _meta: { authorization: 'Bearer metro-key-1' },
    arguments: { authorization: 'Bearer other' }
  });

  expect(token).toBe('metro-key-1');
});

test('extractMetroApiKeyFromHeaders supports authorization header', () => {
  const token = extractMetroApiKeyFromHeaders({
    Authorization: 'Bearer metro-header-token'
  });

  expect(token).toBe('metro-header-token');
});
