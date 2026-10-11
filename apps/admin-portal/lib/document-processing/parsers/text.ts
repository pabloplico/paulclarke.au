import type { ParseResult } from './index';

export async function parseText(buffer: Buffer, _filename: string): Promise<ParseResult> {
  // Handle UTF-8 BOM
  let text = buffer.toString('utf-8');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  return { text };
}
