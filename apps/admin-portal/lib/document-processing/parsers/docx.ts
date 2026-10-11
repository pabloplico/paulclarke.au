import mammoth from 'mammoth';
import type { ParseResult } from './index';

export async function parseDocx(buffer: Buffer, _filename: string): Promise<ParseResult> {
  // mammoth.convertToHtml is the primary API; extract raw text for RAG processing
  const result = await mammoth.extractRawText({ buffer });

  const metadata: Record<string, unknown> = {};
  if (result.messages.length > 0) {
    metadata.conversionMessages = result.messages.map((m: { message: string }) => m.message);
  }

  return {
    text: result.value,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}
