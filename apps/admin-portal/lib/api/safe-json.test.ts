import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { safeParseJson } from './safe-json';

function makeRequest(body: string): Request {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

describe('safeParseJson', () => {
  describe('without schema', () => {
    it('returns parsed data for valid JSON', async () => {
      const result = await safeParseJson(makeRequest('{"name":"test"}'));
      expect(result.error).toBeUndefined();
      expect(result.data).toEqual({ name: 'test' });
    });

    it('returns 400 error for malformed JSON', async () => {
      const result = await safeParseJson(makeRequest('not json{'));
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error!.status).toBe(400);
      const body = await result.error!.json();
      expect(body).toEqual({ error: 'Invalid JSON in request body' });
    });

    it('returns parsed data for empty object', async () => {
      const result = await safeParseJson(makeRequest('{}'));
      expect(result.data).toEqual({});
      expect(result.error).toBeUndefined();
    });
  });

  describe('with Zod schema', () => {
    const schema = z.object({
      title: z.string(),
      count: z.number(),
    });

    it('returns typed data on valid input', async () => {
      const result = await safeParseJson(makeRequest('{"title":"hello","count":5}'), schema);
      expect(result.error).toBeUndefined();
      expect(result.data).toEqual({ title: 'hello', count: 5 });
    });

    it('returns 400 with field errors on validation failure', async () => {
      const result = await safeParseJson(makeRequest('{"title":123}'), schema);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error!.status).toBe(400);
      const body = await result.error!.json();
      expect(body.error).toBe('Validation failed');
      expect(body.details).toBeDefined();
      expect(body.details.title).toBeDefined();
    });

    it('returns 400 for malformed JSON before schema validation', async () => {
      const result = await safeParseJson(makeRequest('not json'), schema);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error!.status).toBe(400);
      const body = await result.error!.json();
      expect(body.error).toBe('Invalid JSON in request body');
    });

    it('strips extra fields when schema does not allow them', async () => {
      const strictSchema = z.object({ name: z.string() }).strict();
      const result = await safeParseJson(makeRequest('{"name":"ok","extra":"bad"}'), strictSchema);
      expect(result.error).toBeDefined();
      expect(result.error!.status).toBe(400);
    });
  });
});
