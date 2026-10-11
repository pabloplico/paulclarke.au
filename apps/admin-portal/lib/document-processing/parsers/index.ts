import { PermanentProcessingError } from '../errors';
import { parseCsv } from './csv';
import { parseDocx } from './docx';
import { parseMarkdown } from './markdown';
import { parsePdf } from './pdf';
import { parseText } from './text';

export type ParseResult = {
  text: string;
  pageCount?: number;
  metadata?: Record<string, unknown>;
};

type Parser = (buffer: Buffer, filename: string) => Promise<ParseResult>;

const parsers: Record<string, Parser> = {
  'text/plain': parseText,
  'text/markdown': parseMarkdown,
  'application/pdf': parsePdf,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': parseDocx,
  'text/csv': parseCsv,
};

// Fallback: map file extensions to MIME types for cases where MIME detection is unreliable
const extensionMap: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.csv': 'text/csv',
};

export function getParser(mimeType: string, filename?: string): Parser {
  const parser = parsers[mimeType];
  if (parser) return parser;

  // Try extension-based fallback
  if (filename) {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    const mappedMime = extensionMap[ext];
    if (mappedMime && parsers[mappedMime]) {
      return parsers[mappedMime];
    }
  }

  throw new PermanentProcessingError(
    `Unsupported file type: ${mimeType}`,
    'UNSUPPORTED_TYPE',
    'extract'
  );
}

export const supportedMimeTypes = Object.keys(parsers);
export const supportedExtensions = Object.keys(extensionMap);
