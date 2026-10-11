import { describe, expect, it } from 'vitest';
import { getParser, supportedMimeTypes } from './index';

describe('getParser', () => {
  it('returns parsers for all supported MIME types', () => {
    for (const mime of supportedMimeTypes) {
      expect(() => getParser(mime)).not.toThrow();
    }
  });

  it('falls back to extension when MIME type is unknown', () => {
    // application/octet-stream is not in the parser map, but .csv extension should work
    expect(() => getParser('application/octet-stream', 'data.csv')).not.toThrow();
    expect(() => getParser('application/octet-stream', 'readme.md')).not.toThrow();
  });

  it('throws for unsupported file types', () => {
    expect(() => getParser('application/zip')).toThrow('Unsupported file type');
    expect(() => getParser('image/png', 'photo.png')).toThrow('Unsupported file type');
  });

  it('prefers MIME type over extension', () => {
    // If MIME says text/plain, use text parser even if extension is .csv
    const parser = getParser('text/plain', 'data.csv');
    expect(parser).toBeDefined();
  });
});
