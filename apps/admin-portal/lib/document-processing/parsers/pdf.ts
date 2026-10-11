import pdfParse from 'pdf-parse';
import type { ParseResult } from './index';

export async function parsePdf(buffer: Buffer, _filename: string): Promise<ParseResult> {
  const data = await pdfParse(buffer);

  return {
    text: data.text,
    pageCount: data.numpages,
    metadata: data.info
      ? {
          title: data.info.Title,
          author: data.info.Author,
          creator: data.info.Creator,
        }
      : undefined,
  };
}
