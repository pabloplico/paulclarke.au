import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rejectOversizedDemoRequest, validateFileUpload } from './upload-validation';

vi.mock('./parsers', () => ({
  supportedMimeTypes: [
    'text/plain',
    'text/markdown',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv',
  ],
}));

vi.mock('@/lib/config', () => ({
  config: {
    upload: { maxFileSizeBytes: 25 * 1024 * 1024 },
  },
}));

function makeFile(name: string, size: number, type: string) {
  return { name, size, type } as File;
}

describe('validateFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-201 — Happy path: valid PDF by MIME type
  it('happy path: returns valid for a PDF file with correct MIME type', () => {
    const file = makeFile('report.pdf', 1_000_000, 'application/pdf');
    const result = validateFileUpload(file);
    expect(result).toEqual({ valid: true });
  });

  // TC-202 — Happy path: valid plain text by MIME type
  it('happy path: returns valid for a plain text file', () => {
    const file = makeFile('notes.txt', 500, 'text/plain');
    const result = validateFileUpload(file);
    expect(result).toEqual({ valid: true });
  });

  // TC-203 — Happy path: valid file by extension when MIME is empty string
  it('happy path: returns valid for a .csv file with empty MIME type (extension fallback)', () => {
    const file = makeFile('data.csv', 200, '');
    const result = validateFileUpload(file);
    expect(result).toEqual({ valid: true });
  });

  // TC-204 — Happy path: .markdown extension is valid
  it('happy path: returns valid for a .markdown extension with octet-stream MIME', () => {
    const file = makeFile('readme.markdown', 100, 'application/octet-stream');
    const result = validateFileUpload(file);
    expect(result).toEqual({ valid: true });
  });

  // TC-205 — Happy path: .md extension is valid
  it('happy path: returns valid for a .md extension with empty MIME type', () => {
    const file = makeFile('doc.md', 100, '');
    const result = validateFileUpload(file);
    expect(result).toEqual({ valid: true });
  });

  // TC-206 — Boundary: exactly at size limit is accepted
  it('boundary condition: file exactly at the size limit is accepted', () => {
    const maxSize = 25 * 1024 * 1024;
    const file = makeFile('ok.pdf', maxSize, 'application/pdf');
    const result = validateFileUpload(file);
    expect(result).toEqual({ valid: true });
  });

  // TC-207 — Error path: file over size limit returns 413 with size info in error message
  // File must be large enough that Math.round(size / (1024*1024)) produces 26
  // 25.5 MB = 26,738,688 bytes rounds to 26; this also exceeds the 25 MB limit
  it('error path: file over size limit returns 413 with size info in error message', () => {
    const maxSize = 25 * 1024 * 1024;
    const oversizedFile = makeFile('big.pdf', Math.ceil(25.5 * 1024 * 1024), 'application/pdf');
    const result = validateFileUpload(oversizedFile);
    expect(result).toMatchObject({ valid: false, status: 413 });
    if (!result.valid) {
      expect(result.error).toContain('25MB');
      expect(result.error).toContain('26');
    }
    // Also verify one byte over limit is rejected (separate assertion)
    const oneByteOver = makeFile('big2.pdf', maxSize + 1, 'application/pdf');
    const result2 = validateFileUpload(oneByteOver);
    expect(result2).toMatchObject({ valid: false, status: 413 });
  });

  // TC-208 — Error path: unsupported MIME type and no extension returns 400
  it('error path: unsupported MIME type and no matching extension returns 400', () => {
    const file = makeFile('image.png', 100, 'image/png');
    const result = validateFileUpload(file);
    expect(result).toMatchObject({ valid: false, status: 400 });
    if (!result.valid) {
      expect(result.error).toContain('image/png');
      expect(result.error).toContain('PDF, DOCX, CSV, Markdown, plain text');
    }
  });

  // TC-209 — Error path: unsupported MIME type and unsupported extension returns 400
  it('error path: zip file with unsupported MIME and extension returns 400', () => {
    const file = makeFile('archive.zip', 100, 'application/zip');
    const result = validateFileUpload(file);
    expect(result).toMatchObject({ valid: false, status: 400 });
  });

  // TC-210 — Boundary: MIME empty and no extension in name returns 400
  it('boundary condition: file with no dot in name and empty MIME returns 400 with "unknown"', () => {
    const file = makeFile('nodotfile', 100, '');
    const result = validateFileUpload(file);
    expect(result).toMatchObject({ valid: false, status: 400 });
    if (!result.valid) {
      expect(result.error).toContain('unknown');
    }
  });

  // TC-211 — Boundary: empty filename with valid MIME is accepted
  it('boundary condition: empty filename with valid MIME type is accepted', () => {
    const file = makeFile('', 100, 'text/plain');
    const result = validateFileUpload(file);
    expect(result).toEqual({ valid: true });
  });

  // TC-212 — Boundary: extension check is case-insensitive
  it('boundary condition: uppercase file extension is normalised and accepted', () => {
    const file = makeFile('REPORT.PDF', 100, '');
    const result = validateFileUpload(file);
    expect(result).toEqual({ valid: true });
  });

  // TC-213 — Boundary: filename with multiple dots uses last extension
  it('boundary condition: filename with multiple dots uses the last extension', () => {
    const file = makeFile('my.report.v2.pdf', 100, '');
    const result = validateFileUpload(file);
    expect(result).toEqual({ valid: true });
  });

  // TC-214 — Boundary: config.upload is undefined — defaults to 25 MB limit
  it('boundary condition: config.upload undefined falls back to 25 MB default limit', async () => {
    const configModule = await import('@/lib/config');
    const original = configModule.config.upload;
    // @ts-expect-error intentionally setting to undefined to test default path
    configModule.config.upload = undefined;

    const file = makeFile('doc.pdf', 24 * 1024 * 1024, 'application/pdf');
    const result = validateFileUpload(file);
    expect(result).toEqual({ valid: true });

    configModule.config.upload = original;
  });

  // TC-215 — Error path: size check takes priority over type check
  it('boundary condition: oversized unsupported file returns 413 (size check first)', async () => {
    const configModule = await import('@/lib/config');
    const original = configModule.config.upload;
    configModule.config.upload = { maxFileSizeBytes: 1000, maxPdfPages: 200 };

    const file = makeFile('huge.png', 50_000_000, 'image/png');
    const result = validateFileUpload(file);
    expect(result).toMatchObject({ valid: false, status: 413 });

    configModule.config.upload = original;
  });
});

describe('demo uploads', () => {
  const saved = process.env.DEMO_MODE;
  beforeEach(() => {
    process.env.DEMO_MODE = 'true';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = saved;
  });

  it('accepts Markdown, plain text and CSV up to 2 MB', () => {
    for (const [name, type] of [
      ['notes.md', 'text/markdown'],
      ['notes.txt', 'text/plain'],
      ['sales.csv', 'text/csv'],
      ['notes.md', ''],
    ]) {
      expect(validateFileUpload(makeFile(name, 2 * 1024 * 1024, type)).valid, name).toBe(true);
    }
  });

  it('refuses PDF and DOCX, even ones the full app accepts', () => {
    expect(validateFileUpload(makeFile('a.pdf', 1000, 'application/pdf'))).toMatchObject({
      valid: false,
      status: 400,
    });
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(validateFileUpload(makeFile('a.docx', 1000, docx)).valid).toBe(false);
  });

  it('needs both an allowed extension and a text type', () => {
    expect(validateFileUpload(makeFile('a.md', 1000, 'application/pdf')).valid).toBe(false);
    expect(validateFileUpload(makeFile('a.pdf', 1000, 'text/plain')).valid).toBe(false);
  });

  it('refuses anything over 2 MB', () => {
    expect(
      validateFileUpload(makeFile('big.txt', 2 * 1024 * 1024 + 1, 'text/plain'))
    ).toMatchObject({
      valid: false,
      status: 413,
    });
  });
});

describe('rejectOversizedDemoRequest', () => {
  const saved = process.env.DEMO_MODE;
  afterEach(() => {
    if (saved === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = saved;
  });

  const post = (headers: Record<string, string>) =>
    new Request('http://test/api/inbox', { method: 'POST', headers });

  it('does nothing outside demo mode', () => {
    delete process.env.DEMO_MODE;
    expect(rejectOversizedDemoRequest(post({}))).toBeNull();
  });

  it('refuses a body over the limit before it is read', () => {
    process.env.DEMO_MODE = 'true';
    expect(
      rejectOversizedDemoRequest(post({ 'content-length': String(5 * 1024 * 1024) }))?.status
    ).toBe(413);
    expect(rejectOversizedDemoRequest(post({ 'content-length': String(1024 * 1024) }))).toBeNull();
  });

  it('refuses a body of unknown size', () => {
    process.env.DEMO_MODE = 'true';
    expect(rejectOversizedDemoRequest(post({}))?.status).toBe(411);
  });
});
