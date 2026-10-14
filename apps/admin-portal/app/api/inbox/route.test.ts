import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queueDocument = vi.hoisted(() => vi.fn(async () => {}));
const inserted = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: async () => ({ id: 1, email: 'v@example.com', name: 'V', role: 'member' }),
}));
vi.mock('@/lib/ai/allowance', () => ({
  requireAiAllowance: async () => {},
  aiBudgetResponse: () => null,
}));
vi.mock('@/lib/document-processing/queue', () => ({ queueDocument }));
vi.mock('@/lib/storage', () => ({ storage: { save: async (name: string) => `/uploads/${name}` } }));
vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (values: unknown) => {
        inserted.rows.push(values);
        return { returning: async () => [{ id: inserted.rows.length, ...(values as object) }] };
      },
    }),
  },
}));

const { POST } = await import('./route');

function json(body: unknown) {
  const text = JSON.stringify(body);
  return new Request('http://test/api/inbox', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(text.length) },
    body: text,
  });
}

async function multipart(file: File) {
  const form = new FormData();
  form.set('file', file);
  // Serialise once so the request carries a real Content-Length
  const probe = new Request('http://test', { method: 'POST', body: form });
  const body = await probe.arrayBuffer();
  return new Request('http://test/api/inbox', {
    method: 'POST',
    headers: {
      'content-type': probe.headers.get('content-type') ?? '',
      'content-length': String(body.byteLength),
    },
    body,
  });
}

beforeEach(() => {
  process.env.DEMO_MODE = 'true';
  inserted.rows = [];
  queueDocument.mockClear();
});

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe('POST /api/inbox in demo mode', () => {
  it('refuses to fetch a URL', async () => {
    const response = await POST(
      json({ type: 'url', title: 'x', content: 'http://169.254.169.254/' })
    );
    expect(response.status).toBe(403);
    expect(inserted.rows).toEqual([]);
    expect(queueDocument).not.toHaveBeenCalled();
  });

  it('accepts a Markdown upload', async () => {
    const response = await POST(
      await multipart(new File(['# Hi'], 'notes.md', { type: 'text/markdown' }))
    );
    expect(response.status).toBe(202);
    expect(queueDocument).toHaveBeenCalledTimes(1);
  });

  it('refuses a PDF upload', async () => {
    const response = await POST(
      await multipart(new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' }))
    );
    expect(response.status).toBe(400);
    expect(queueDocument).not.toHaveBeenCalled();
  });

  it('refuses an oversized body before reading it', async () => {
    const request = new Request('http://test/api/inbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(50 * 1024 * 1024) },
      body: '{}',
    });
    const read = vi.spyOn(request, 'formData');
    expect((await POST(request)).status).toBe(413);
    expect(read).not.toHaveBeenCalled();
  });

  it('still takes notes', async () => {
    const response = await POST(
      json({ type: 'note', title: 'Call notes', content: 'Ring the mill' })
    );
    expect(response.status).toBe(202);
  });
});
