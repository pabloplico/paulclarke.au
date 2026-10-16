import { promises as fs } from 'node:fs';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { defineTool } from '@/lib/agents/define-tool';
import { uploadsDir } from '@/lib/storage';

/** True when `path` is `root` or inside it. */
function isInside(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep);
}

/**
 * The real path of `filePath`, refusing anything outside the uploads
 * directory: checked once as written ("..") and again after following
 * symlinks.
 */
async function resolveUpload(filePath: string): Promise<string> {
  const root = await fs.realpath(uploadsDir());
  const outside = new Error('File is outside the uploads directory');
  if (!isInside(uploadsDir(), resolve(uploadsDir(), filePath))) throw outside;
  const real = await fs.realpath(resolve(uploadsDir(), filePath));
  if (!isInside(root, real)) throw outside;
  return real;
}

/**
 * Parse PDF or CSV files and extract text content.
 * Uses pdf-parse for PDFs and csv-parse for CSVs.
 */
export const fileParserTool = defineTool({
  description: 'Parse a PDF or CSV file and extract text content',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file'),
    fileType: z.enum(['pdf', 'csv']).describe('Type of file'),
  }),
  outputSchema: z.object({
    content: z.string(),
    metadata: z.record(z.string(), z.unknown()),
  }),
  execute: async ({ filePath, fileType }) => {
    try {
      // Prompt injection: the model picks filePath, so it may only reach uploaded files
      const path = await resolveUpload(filePath);

      if (fileType === 'pdf') {
        const pdfParse = await import('pdf-parse');
        const buffer = await fs.readFile(path);
        const result = await pdfParse.default(buffer);
        return { content: result.text, metadata: { pages: result.numpages } };
      }

      // CSV parsing
      const { parse } = await import('csv-parse/sync');
      const content = await fs.readFile(path, 'utf-8');
      const records = parse(content, { columns: true }) as Record<string, unknown>[];
      return { content: JSON.stringify(records), metadata: { rows: records.length } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: `Parse failed: ${msg}`, metadata: { error: msg } };
    }
  },
});
