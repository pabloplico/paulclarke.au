/**
 * Text cleaning pipeline for document processing.
 * Applies a series of transformations to normalize extracted text.
 */

export function cleanText(rawText: string, _options?: { sourceType?: string }): string {
  let text = rawText;

  text = stripHeadersFooters(text);
  text = normalizeWhitespace(text);
  text = deduplicateParagraphs(text);
  text = preserveStructure(text);
  text = finalCleanup(text);

  return text;
}

/**
 * Detect and remove repeated headers/footers and page numbers.
 */
function stripHeadersFooters(text: string): string {
  const pages = text.split(/\f/); // Form feed splits pages in PDF output
  if (pages.length <= 1) {
    // Single page — just strip page numbers
    return stripPageNumbers(text);
  }

  // Collect first and last lines from each page to detect repeats
  const firstLines: string[] = [];
  const lastLines: string[] = [];

  for (const page of pages) {
    const lines = page.trim().split('\n');
    const first = lines[0];
    const last = lines[lines.length - 1];
    if (first !== undefined) firstLines.push(first.trim());
    if (lines.length > 1 && last !== undefined) lastLines.push(last.trim());
  }

  // Find repeated headers (same first line on >50% of pages)
  const headerCounts = countOccurrences(firstLines);
  const repeatedHeaders = new Set<string>();
  for (const [line, count] of headerCounts) {
    if (count > pages.length / 2 && line.length > 0) {
      repeatedHeaders.add(line);
    }
  }

  // Find repeated footers
  const footerCounts = countOccurrences(lastLines);
  const repeatedFooters = new Set<string>();
  for (const [line, count] of footerCounts) {
    if (count > pages.length / 2 && line.length > 0) {
      repeatedFooters.add(line);
    }
  }

  // Remove detected headers/footers from each page, preserving page break markers
  const cleaned = pages.map((page) => {
    const lines = page.split('\n');
    const result: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();
      if (i === 0 && repeatedHeaders.has(trimmed)) continue;
      if (i === lines.length - 1 && repeatedFooters.has(trimmed)) continue;
      result.push(line);
    }
    return result.join('\n');
  });

  // Rejoin pages with form feed preserved so downstream chunker can track page boundaries
  return stripPageNumbers(cleaned.join('\n\f\n'));
}

/**
 * Remove standalone page numbers and "Page X of Y" patterns.
 */
function stripPageNumbers(text: string): string {
  return text
    .replace(/^\s*\d+\s*$/gm, '') // Standalone numbers on a line
    .replace(/^\s*[-–—]\s*\d+\s*[-–—]\s*$/gm, '') // - X -
    .replace(/^\s*[Pp]age\s+\d+(\s+of\s+\d+)?\s*$/gm, ''); // Page X of Y
}

/**
 * Normalize whitespace and fix encoding artifacts.
 */
function normalizeWhitespace(text: string): string {
  return (
    text
      // Fix encoding artifacts
      .replace(/[\u2018\u2019]/g, "'") // Smart single quotes → ASCII
      .replace(/[\u201C\u201D]/g, '"') // Smart double quotes → ASCII
      .replace(/\u00A0/g, ' ') // Non-breaking space → regular space
      .replace(/\u2013/g, '-') // En dash → hyphen
      .replace(/\u2014/g, '--') // Em dash → double hyphen
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n')
      // Collapse excessive blank lines (3+ → 2)
      .replace(/\n{3,}/g, '\n\n')
  );
}

/**
 * Remove exact duplicate paragraphs (from repeated headers/footers across pages).
 */
function deduplicateParagraphs(text: string): string {
  const paragraphs = text.split(/\n\n+/);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Only deduplicate short paragraphs (likely headers/footers, not content)
    if (trimmed.length < 200) {
      const hash = trimmed.toLowerCase();
      if (seen.has(hash)) continue;
      seen.add(hash);
    }

    result.push(trimmed);
  }

  return result.join('\n\n');
}

/**
 * Preserve and enhance structural elements.
 */
function preserveStructure(text: string): string {
  // Already markdown-structured text is kept as-is.
  // Detect lines that look like headings (ALL CAPS, short, followed by content)
  // and convert them to markdown headings.
  const lines = text.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip if already a markdown heading
    if (trimmed.startsWith('#')) {
      result.push(line);
      continue;
    }

    // Convert ALL CAPS short lines to headings (likely section titles)
    if (
      trimmed.length > 2 &&
      trimmed.length < 100 &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed) &&
      !/^\d+$/.test(trimmed)
    ) {
      result.push(`## ${trimmed.charAt(0)}${trimmed.slice(1).toLowerCase()}`);
      continue;
    }

    result.push(line);
  }

  return result.join('\n');
}

/**
 * Final cleanup pass.
 */
function finalCleanup(text: string): string {
  return text
    .trim()
    .replace(/\n{3,}/g, '\n\n') // Final collapse of blank lines
    .replace(/[ \t]+$/gm, ''); // Trailing whitespace on lines
}

function countOccurrences(items: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return counts;
}
