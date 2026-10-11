import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Parse PDF or CSV files and extract text content.
 * Uses pdf-parse for PDFs and csv-parse for CSVs.
 */
export const fileParserTool = createTool({
  id: 'file-parser',
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
      if (fileType === 'pdf') {
        const pdfParse = await import('pdf-parse');
        const fs = await import('node:fs');
        const buffer = await fs.promises.readFile(filePath);
        const result = await pdfParse.default(buffer);
        return { content: result.text, metadata: { pages: result.numpages } };
      }

      // CSV parsing
      const { parse } = await import('csv-parse/sync');
      const fs = await import('node:fs');
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const records = parse(content, { columns: true }) as Record<string, unknown>[];
      return { content: JSON.stringify(records), metadata: { rows: records.length } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: `Parse failed: ${msg}`, metadata: { error: msg } };
    }
  },
});
