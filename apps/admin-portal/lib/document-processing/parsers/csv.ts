import Papa from 'papaparse';
import type { ParseResult } from './index';

export async function parseCsv(buffer: Buffer, _filename: string): Promise<ParseResult> {
  const csvString = buffer.toString('utf-8');
  const result = Papa.parse<Record<string, string>>(csvString, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(`CSV parse failed: ${result.errors[0]?.message}`);
  }

  const headers = result.meta.fields || [];
  const rows = result.data;

  // Convert to markdown table for RAG-friendly representation
  const lines: string[] = [];
  if (headers.length > 0) {
    lines.push(`| ${headers.join(' | ')} |`);
    lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
    for (const row of rows) {
      const cells = headers.map((h) => (row[h] ?? '').replace(/\|/g, '\\|'));
      lines.push(`| ${cells.join(' | ')} |`);
    }
  }

  return {
    text: lines.join('\n'),
    metadata: {
      rowCount: rows.length,
      columnCount: headers.length,
      columns: headers,
    },
  };
}
