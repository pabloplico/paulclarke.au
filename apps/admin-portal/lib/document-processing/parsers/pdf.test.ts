import { describe, expect, it, vi } from 'vitest';

vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

describe('parsePdf', () => {
  async function getModule() {
    return import('./pdf');
  }

  it('returns text and page count from parsed PDF', async () => {
    const pdfParse = (await import('pdf-parse')).default as ReturnType<typeof vi.fn>;
    pdfParse.mockResolvedValue({
      text: 'Hello world\nPage two content',
      numpages: 2,
      info: { Title: 'Test Doc', Author: 'Jane', Creator: 'Word' },
    });

    const { parsePdf } = await getModule();
    const result = await parsePdf(Buffer.from('fake-pdf'), 'test.pdf');

    expect(result.text).toBe('Hello world\nPage two content');
    expect(result.pageCount).toBe(2);
    expect(result.metadata).toEqual({
      title: 'Test Doc',
      author: 'Jane',
      creator: 'Word',
    });
  });

  it('returns undefined metadata when info is null', async () => {
    const pdfParse = (await import('pdf-parse')).default as ReturnType<typeof vi.fn>;
    pdfParse.mockResolvedValue({
      text: 'Some text',
      numpages: 1,
      info: null,
    });

    const { parsePdf } = await getModule();
    const result = await parsePdf(Buffer.from('fake-pdf'), 'doc.pdf');

    expect(result.text).toBe('Some text');
    expect(result.pageCount).toBe(1);
    expect(result.metadata).toBeUndefined();
  });

  it('propagates pdf-parse errors', async () => {
    const pdfParse = (await import('pdf-parse')).default as ReturnType<typeof vi.fn>;
    pdfParse.mockRejectedValue(new Error('Invalid PDF'));

    const { parsePdf } = await getModule();
    await expect(parsePdf(Buffer.from('bad'), 'bad.pdf')).rejects.toThrow('Invalid PDF');
  });
});
