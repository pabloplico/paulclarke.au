import { createHash } from 'node:crypto';
import { config } from '@/lib/config';

export type ChunkMetadata = {
  sectionHeading?: string;
  headingPath?: string[];
  contentType?: 'prose' | 'code' | 'table';
  pageRange?: string;
  totalChunks?: number;
  contentHash?: string;
  startOffset?: number;
  endOffset?: number;
};

export type Chunk = {
  content: string;
  index: number;
  metadata: ChunkMetadata;
};

export type ChunkOptions = {
  chunkSize?: number;
  overlap?: number;
};

/**
 * Structure-aware text chunker.
 * Respects headings, code blocks, tables, and paragraph boundaries.
 * Tracks page boundaries from form feed characters (\f) to populate pageRange.
 * Maintains heading ancestry for full H1 > H2 > H3 paths.
 * Tracks character offsets for accurate page range and position mapping.
 */

/**
 * Build a map of character offsets to page numbers from form feed markers.
 */
function buildPageMap(text: string): { offset: number; page: number }[] {
  const entries: { offset: number; page: number }[] = [{ offset: 0, page: 1 }];
  let page = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\f') {
      page++;
      entries.push({ offset: i + 1, page });
    }
  }
  return entries;
}

/**
 * Look up the page range using character offsets directly.
 * Eliminates the indexOf ambiguity for overlapping chunks.
 */
function getPageRange(
  startOffset: number,
  endOffset: number,
  pageMap: { offset: number; page: number }[]
): string | undefined {
  if (pageMap.length <= 1) return undefined;

  let startPage = 1;
  let endPage = 1;
  for (const entry of pageMap) {
    if (entry.offset <= startOffset) startPage = entry.page;
    if (entry.offset <= endOffset) endPage = entry.page;
  }

  return startPage === endPage ? `${startPage}` : `${startPage}-${endPage}`;
}

export function chunkText(
  text: string,
  { chunkSize = config.rag.chunkSize, overlap = config.rag.chunkOverlap }: ChunkOptions = {}
): Chunk[] {
  if (!text.trim()) return [];

  // Build page map before stripping form feeds
  const pageMap = buildPageMap(text);
  const hasPages = pageMap.length > 1;

  // Strip form feed characters for actual chunking (they're just markers)
  // Build an offset map from cleaned positions to original positions for page range
  const cleanedText = text.replace(/\f/g, '');

  const sections = splitIntoSections(cleanedText);
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionChunks = chunkSection(section, chunkSize, overlap, chunkIndex);
    // Populate page ranges using offsets if page breaks were detected
    if (hasPages) {
      for (const chunk of sectionChunks) {
        if (chunk.metadata.startOffset !== undefined && chunk.metadata.endOffset !== undefined) {
          chunk.metadata.pageRange = getPageRange(
            chunk.metadata.startOffset,
            chunk.metadata.endOffset,
            pageMap
          );
        }
      }
    }
    chunks.push(...sectionChunks);
    chunkIndex += sectionChunks.length;
  }

  // Post-pass: set totalChunks and contentHash on all chunks
  const totalChunks = chunks.length;
  for (const chunk of chunks) {
    chunk.metadata.totalChunks = totalChunks;
    chunk.metadata.contentHash = createHash('sha256').update(chunk.content).digest('hex');
  }

  return chunks;
}

type Section = {
  heading?: string;
  headingPath: string[];
  blocks: Block[];
  baseOffset: number;
};

type Block = {
  content: string;
  type: 'prose' | 'code' | 'table';
  startOffset: number;
};

/**
 * Split text into heading-delimited sections, preserving code blocks and tables.
 * Maintains a heading ancestry stack for full H1 > H2 > H3 paths.
 * Tracks character offsets for each block.
 */
function splitIntoSections(text: string): Section[] {
  const sections: Section[] = [];
  let currentHeading: string | undefined;
  let currentBlocks: Block[] = [];
  const headingStack: { level: number; text: string }[] = [];
  let currentBaseOffset = 0;

  const lines = text.split('\n');
  let i = 0;
  let charPos = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const lineStart = charPos;

    // Detect heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      // Flush current section
      if (currentBlocks.length > 0 || currentHeading) {
        sections.push({
          heading: currentHeading,
          headingPath: headingStack.map((h) => h.text),
          blocks: currentBlocks,
          baseOffset: currentBaseOffset,
        });
      }

      // Update heading stack
      const level = headingMatch[1]?.length ?? 0;
      const headingText = headingMatch[2]?.trim() ?? '';

      // Pop all entries with level >= current
      while (
        headingStack.length > 0 &&
        (headingStack[headingStack.length - 1]?.level ?? 0) >= level
      ) {
        headingStack.pop();
      }
      headingStack.push({ level, text: headingText });

      currentHeading = headingText;
      currentBlocks = [];
      currentBaseOffset = charPos + line.length + 1; // after heading line + newline
      charPos += line.length + 1;
      i++;
      continue;
    }

    // Detect fenced code block
    if (/^```/.test(line.trim())) {
      const codeLines = [line];
      charPos += line.length + 1;
      i++;
      while (i < lines.length) {
        const nextLine = lines[i]!;
        if (/^```/.test(nextLine.trim())) break;
        codeLines.push(nextLine);
        charPos += nextLine.length + 1;
        i++;
      }
      if (i < lines.length) {
        codeLines.push(lines[i]!);
        charPos += (lines[i]?.length ?? 0) + 1;
        i++;
      }
      currentBlocks.push({ content: codeLines.join('\n'), type: 'code', startOffset: lineStart });
      continue;
    }

    // Detect markdown table (line starts with |)
    if (/^\|/.test(line.trim())) {
      const tableLines = [line];
      charPos += line.length + 1;
      i++;
      while (i < lines.length) {
        const nextLine = lines[i]!;
        if (!/^\|/.test(nextLine.trim())) break;
        tableLines.push(nextLine);
        charPos += nextLine.length + 1;
        i++;
      }
      currentBlocks.push({
        content: tableLines.join('\n'),
        type: 'table',
        startOffset: lineStart,
      });
      continue;
    }

    // Regular prose line
    currentBlocks.push({ content: line, type: 'prose', startOffset: lineStart });
    charPos += line.length + 1;
    i++;
  }

  // Flush last section
  if (currentBlocks.length > 0 || currentHeading) {
    sections.push({
      heading: currentHeading,
      headingPath: headingStack.map((h) => h.text),
      blocks: currentBlocks,
      baseOffset: currentBaseOffset,
    });
  }

  return sections;
}

/**
 * Chunk a single section, respecting block boundaries.
 */
function chunkSection(
  section: Section,
  chunkSize: number,
  overlap: number,
  startIndex: number
): Chunk[] {
  // Merge consecutive prose blocks into paragraphs
  const mergedBlocks = mergeProseBlocks(section.blocks);
  const chunks: Chunk[] = [];
  let currentContent = '';
  let currentType: 'prose' | 'code' | 'table' = 'prose';
  let currentStartOffset = section.baseOffset;

  const makeMetadata = (
    contentType: 'prose' | 'code' | 'table',
    startOff: number,
    endOff: number
  ): ChunkMetadata => ({
    sectionHeading: section.heading,
    headingPath: section.headingPath,
    contentType,
    startOffset: startOff,
    endOffset: endOff,
  });

  for (const block of mergedBlocks) {
    // Code blocks and tables that exceed chunk size become their own chunk
    if (block.type === 'code' || block.type === 'table') {
      // Flush prose buffer first
      if (currentContent.trim()) {
        const parts = splitLargeText(currentContent.trim(), chunkSize, overlap);
        let partOffset = currentStartOffset;
        for (const c of parts) {
          chunks.push({
            content: c,
            index: startIndex + chunks.length,
            metadata: makeMetadata(currentType, partOffset, partOffset + c.length),
          });
          partOffset += c.length - overlap;
        }
        currentContent = '';
      }

      // Add code/table block(s)
      if (block.content.length <= chunkSize) {
        chunks.push({
          content: block.content,
          index: startIndex + chunks.length,
          metadata: makeMetadata(
            block.type,
            block.startOffset,
            block.startOffset + block.content.length
          ),
        });
      } else {
        const parts = splitLargeText(block.content, chunkSize, overlap);
        let partOffset = block.startOffset;
        for (const c of parts) {
          chunks.push({
            content: c,
            index: startIndex + chunks.length,
            metadata: makeMetadata(block.type, partOffset, partOffset + c.length),
          });
          partOffset += c.length - overlap;
        }
      }
      continue;
    }

    // Prose: accumulate into buffer
    const candidate = currentContent ? `${currentContent}\n${block.content}` : block.content;
    if (candidate.length > chunkSize && currentContent.trim()) {
      // Flush current content
      const parts = splitLargeText(currentContent.trim(), chunkSize, overlap);
      let partOffset = currentStartOffset;
      for (const c of parts) {
        chunks.push({
          content: c,
          index: startIndex + chunks.length,
          metadata: makeMetadata('prose', partOffset, partOffset + c.length),
        });
        partOffset += c.length - overlap;
      }
      currentContent = block.content;
      currentStartOffset = block.startOffset;
    } else {
      if (!currentContent) {
        currentStartOffset = block.startOffset;
      }
      currentContent = candidate;
    }
    currentType = 'prose';
  }

  // Flush remaining content
  if (currentContent.trim()) {
    const parts = splitLargeText(currentContent.trim(), chunkSize, overlap);
    let partOffset = currentStartOffset;
    for (const c of parts) {
      chunks.push({
        content: c,
        index: startIndex + chunks.length,
        metadata: makeMetadata(currentType, partOffset, partOffset + c.length),
      });
      partOffset += c.length - overlap;
    }
  }

  return chunks;
}

/**
 * Merge consecutive prose blocks into larger text blocks separated by newlines.
 * Preserves the startOffset of the first block in each merged group.
 */
function mergeProseBlocks(blocks: Block[]): Block[] {
  const result: Block[] = [];
  let proseBuffer: string[] = [];
  let firstOffset = 0;

  for (const block of blocks) {
    if (block.type === 'prose') {
      if (proseBuffer.length === 0) {
        firstOffset = block.startOffset;
      }
      proseBuffer.push(block.content);
    } else {
      if (proseBuffer.length > 0) {
        result.push({ content: proseBuffer.join('\n'), type: 'prose', startOffset: firstOffset });
        proseBuffer = [];
      }
      result.push(block);
    }
  }

  if (proseBuffer.length > 0) {
    result.push({ content: proseBuffer.join('\n'), type: 'prose', startOffset: firstOffset });
  }

  return result;
}

/**
 * Split large text at paragraph or sentence boundaries with overlap.
 */
function splitLargeText(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) return [text];

  const parts: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    if (end < text.length) {
      // Prefer paragraph boundary
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      if (paragraphBreak > start + chunkSize / 2) {
        end = paragraphBreak;
      } else {
        // Try sentence boundary
        const sentenceBreak = text.lastIndexOf('. ', end);
        if (sentenceBreak > start + chunkSize / 2) {
          end = sentenceBreak + 1;
        }
      }
    }

    const content = text.slice(start, end).trim();
    if (content) parts.push(content);

    start = end - overlap;
    if (start >= text.length || end === text.length) break;
  }

  return parts;
}
