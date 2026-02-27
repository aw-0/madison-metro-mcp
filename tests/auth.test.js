import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBearerToken, extractMetroApiKeyFromToolCall } from '../src/lib/auth.js';

test('extractBearerToken returns token for standard bearer header', () => {
  assert.equal(extractBearerToken('Bearer abc123'), 'abc123');
});

test('extractBearerToken returns undefined for non-bearer input', () => {
  assert.equal(extractBearerToken('Token abc123'), undefined);
});

test('extractMetroApiKeyFromToolCall checks metadata and arguments', () => {
  const token = extractMetroApiKeyFromToolCall({
    _meta: { authorization: 'Bearer metro-key-1' },
    arguments: { authorization: 'Bearer other' }
  });

  assert.equal(token, 'metro-key-1');
});
