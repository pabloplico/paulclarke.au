import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

describe('parseDocx', () => {
  async function getModule() {
    return import('./docx');
  }

  async function getMammoth() {
    return (await import('mammoth')).default;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns extracted text from DOCX', async () => {
    const mammoth = await getMammoth();
    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: 'Extracted document text',
      messages: [],
    });

    const { parseDocx } = await getModule();
    const result = await parseDocx(Buffer.from('fake-docx'), 'test.docx');

    expect(result.text).toBe('Extracted document text');
    expect(result.metadata).toBeUndefined();
  });

  it('includes conversion messages in metadata when present', async () => {
    const mammoth = await getMammoth();
    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: 'Some text',
      // biome-ignore lint/suspicious/noExplicitAny: test mock for mammoth Message type
      messages: [
        { message: 'Unrecognised style: CustomStyle', type: 'warning' },
        { message: 'Missing image: image1.png', type: 'warning' },
      ] as any,
    });

    const { parseDocx } = await getModule();
    const result = await parseDocx(Buffer.from('fake'), 'doc.docx');

    expect(result.text).toBe('Some text');
    expect(result.metadata).toEqual({
      conversionMessages: ['Unrecognised style: CustomStyle', 'Missing image: image1.png'],
    });
  });

  it('propagates mammoth errors', async () => {
    const mammoth = await getMammoth();
    vi.mocked(mammoth.extractRawText).mockRejectedValue(new Error('Corrupt file'));

    const { parseDocx } = await getModule();
    await expect(parseDocx(Buffer.from('bad'), 'bad.docx')).rejects.toThrow('Corrupt file');
  });

  // ── GAP-012: Edge case tests ──────────────────────────────────────────────

  it('TC-012-N1: returns empty string when mammoth yields empty value', async () => {
    const mammoth = await getMammoth();
    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: '',
      messages: [],
    });

    const { parseDocx } = await getModule();
    const result = await parseDocx(Buffer.from('empty'), 'empty.docx');

    expect(result.text).toBe('');
    expect(result.metadata).toBeUndefined();
  });

  it('TC-012-N2: returns whitespace-only text without trimming and no metadata', async () => {
    const mammoth = await getMammoth();
    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: '   \n\t   ',
      messages: [],
    });

    const { parseDocx } = await getModule();
    const result = await parseDocx(Buffer.from('ws'), 'whitespace.docx');

    // Function does not trim — preserves original whitespace
    expect(result.text).toBe('   \n\t   ');
    expect(result.metadata).toBeUndefined();
  });

  it('TC-012-N3: metadata key is exactly conversionMessages (not renamed)', async () => {
    const mammoth = await getMammoth();
    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: 'text',
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      messages: [{ message: 'one warning', type: 'warning' }] as any,
    });

    const { parseDocx } = await getModule();
    const result = await parseDocx(Buffer.from('x'), 'x.docx');

    expect(Object.keys(result.metadata!)).toEqual(['conversionMessages']);
  });

  it('TC-012-N4: only message string is collected, not the full message object', async () => {
    const mammoth = await getMammoth();
    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: 'text',
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      messages: [{ message: 'warn text', type: 'warning', extra: 'ignored' }] as any,
    });

    const { parseDocx } = await getModule();
    const result = await parseDocx(Buffer.from('x'), 'x.docx');

    const msgs = result.metadata!.conversionMessages as string[];
    expect(msgs[0]).toBe('warn text');
    expect(typeof msgs[0]).toBe('string');
  });

  it('TC-012-N5: handles single message without losing it in an array', async () => {
    const mammoth = await getMammoth();
    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: 'text',
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      messages: [{ message: 'sole warning', type: 'warning' }] as any,
    });

    const { parseDocx } = await getModule();
    const result = await parseDocx(Buffer.from('x'), 'x.docx');

    expect(result.metadata!.conversionMessages).toEqual(['sole warning']);
    expect(result.metadata!.conversionMessages).toHaveLength(1);
  });

  it('TC-012-N6: handles many messages (15) without truncation', async () => {
    const mammoth = await getMammoth();
    const messages = Array.from({ length: 15 }, (_, i) => ({
      message: `msg-${i}`,
      type: 'warning' as const,
    }));
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: 'text',
      messages: messages as any,
    });

    const { parseDocx } = await getModule();
    const result = await parseDocx(Buffer.from('x'), 'x.docx');

    expect(result.metadata!.conversionMessages).toHaveLength(15);
  });

  it('TC-012-N7: filename parameter is accepted but does not affect output', async () => {
    const mammoth = await getMammoth();
    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: 'same content',
      messages: [],
    });

    const { parseDocx } = await getModule();
    const result1 = await parseDocx(Buffer.from('buf'), 'a.docx');
    const result2 = await parseDocx(Buffer.from('buf'), 'b.docx');

    expect(result1.text).toBe(result2.text);
    expect(result1.metadata).toEqual(result2.metadata);
  });

  it('TC-012-N8: mammoth rejects with a non-Error value (string thrown)', async () => {
    const mammoth = await getMammoth();
    vi.mocked(mammoth.extractRawText).mockRejectedValue('bad buffer');

    const { parseDocx } = await getModule();
    await expect(parseDocx(Buffer.from('bad'), 'bad.docx')).rejects.toBe('bad buffer');
  });
});
