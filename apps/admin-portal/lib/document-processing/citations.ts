/**
 * Citation extraction and verification for document processing.
 * Extracts citations before chunking and replaces them with stable placeholders.
 */

export type CitationType = 'url' | 'doi' | 'footnote' | 'numbered_ref' | 'author_year' | 'unknown';

export type ExtractedCitation = {
  index: number;
  type: CitationType;
  rawMarker: string;
  resolvedText: string | null;
  url: string | null;
  placeholderId: string;
  charOffset: number;
};

type ExtractionResult = {
  citations: ExtractedCitation[];
  annotatedText: string;
};

// ── Regex patterns for citation types ──────────────────────────────────────

const DOI_PATTERN = /\b(10\.\d{4,9}\/[^\s)\]]+)/g;
const DOI_URL_PATTERN = /https?:\/\/doi\.org\/(10\.\d{4,9}\/[^\s)\]]+)/g;
const URL_PATTERN = /https?:\/\/[^\s)\]>]+/g;
const NUMBERED_REF_INLINE = /\[(\d{1,3})\]/g;
const AUTHOR_YEAR_PATTERN =
  /\(([A-Z][a-z]+(?:\s+(?:et\s+al\.|&\s+[A-Z][a-z]+))?),?\s*(\d{4}[a-z]?)\)/g;
const FOOTNOTE_INLINE = /\[\^(\w+)\]/g;
const FOOTNOTE_DEF = /^\[\^(\w+)\]:\s*(.+)$/gm;
const REFERENCE_LIST_ENTRY = /^\[(\d{1,3})\]\s+(.+)$/gm;

/**
 * Extract citations from cleaned text and replace with stable placeholders.
 * Runs before chunking to ensure citations are correlated while full document is intact.
 */
export function extractCitations(cleanedText: string, documentId: number): ExtractionResult {
  const citations: ExtractedCitation[] = [];
  const matchedRanges: [number, number][] = [];
  let citationIndex = 0;

  // Helper to check if a range overlaps with already-matched ranges
  function isOverlapping(start: number, end: number): boolean {
    return matchedRanges.some(([s, e]) => start < e && end > s);
  }

  function addCitation(
    type: CitationType,
    rawMarker: string,
    charOffset: number,
    length: number,
    resolvedText: string | null = null,
    url: string | null = null
  ) {
    if (isOverlapping(charOffset, charOffset + length)) return;
    matchedRanges.push([charOffset, charOffset + length]);
    citations.push({
      index: citationIndex,
      type,
      rawMarker,
      resolvedText,
      url,
      placeholderId: `DOC${documentId}-REF${citationIndex}`,
      charOffset,
    });
    citationIndex++;
  }

  // 1. Build reference list map (numbered refs at end of document)
  const refMap = new Map<number, string>();
  const refListPattern = new RegExp(REFERENCE_LIST_ENTRY.source, 'gm');
  for (const match of cleanedText.matchAll(refListPattern)) {
    refMap.set(Number(match[1]), match[2]?.trim() ?? '');
  }

  // 2. Build footnote definition map
  const footnoteMap = new Map<string, string>();
  const footDefPattern = new RegExp(FOOTNOTE_DEF.source, 'gm');
  for (const match of cleanedText.matchAll(footDefPattern)) {
    footnoteMap.set(match[1]!, match[2]?.trim() ?? '');
  }

  // 3. Extract DOIs (highest priority)
  const doiUrlPattern = new RegExp(DOI_URL_PATTERN.source, 'g');
  for (const match of cleanedText.matchAll(doiUrlPattern)) {
    addCitation('doi', match[0], match.index, match[0].length, null, match[0]);
  }

  const doiPattern = new RegExp(DOI_PATTERN.source, 'g');
  for (const match of cleanedText.matchAll(doiPattern)) {
    if (!isOverlapping(match.index, match.index + match[0].length)) {
      addCitation(
        'doi',
        match[0],
        match.index,
        match[0].length,
        null,
        `https://doi.org/${match[1]}`
      );
    }
  }

  // 4. Extract URLs (skip already-matched DOI URLs)
  const urlPattern = new RegExp(URL_PATTERN.source, 'g');
  for (const match of cleanedText.matchAll(urlPattern)) {
    // Strip trailing punctuation
    let url = match[0];
    while (url.endsWith('.') || url.endsWith(',') || url.endsWith(';')) {
      url = url.slice(0, -1);
    }
    if (!isOverlapping(match.index, match.index + url.length)) {
      addCitation('url', url, match.index, url.length, null, url);
    }
  }

  // 5. Extract numbered references [1], [2] etc (only if reference list exists)
  // Skip matches that start a line (these are reference list entries, not inline citations)
  if (refMap.size > 0) {
    const numberedPattern = new RegExp(NUMBERED_REF_INLINE.source, 'g');
    for (const match of cleanedText.matchAll(numberedPattern)) {
      // Skip if this is at the start of a line (reference list entry)
      const isLineStart = match.index === 0 || cleanedText[match.index - 1] === '\n';
      if (isLineStart) continue;

      const refNum = Number(match[1]);
      const resolved = refMap.get(refNum) ?? null;
      if (!isOverlapping(match.index, match.index + match[0].length)) {
        addCitation('numbered_ref', match[0], match.index, match[0].length, resolved);
      }
    }
  }

  // 6. Extract author-year citations
  const authorYearPattern = new RegExp(AUTHOR_YEAR_PATTERN.source, 'g');
  for (const match of cleanedText.matchAll(authorYearPattern)) {
    if (!isOverlapping(match.index, match.index + match[0].length)) {
      addCitation('author_year', match[0], match.index, match[0].length);
    }
  }

  // 7. Extract footnote references (skip definition lines [^id]: ...)
  const footnotePattern = new RegExp(FOOTNOTE_INLINE.source, 'g');
  for (const match of cleanedText.matchAll(footnotePattern)) {
    // Skip footnote definitions (followed by colon)
    const afterMatch = cleanedText[match.index + match[0].length];
    if (afterMatch === ':') continue;

    const id = match[1]!;
    const resolved = footnoteMap.get(id) ?? null;
    if (!isOverlapping(match.index, match.index + match[0].length)) {
      addCitation('footnote', match[0], match.index, match[0].length, resolved);
    }
  }

  // Sort citations by charOffset (descending) for replacement
  const sortedByOffset = [...citations].sort((a, b) => b.charOffset - a.charOffset);

  // Replace inline markers with placeholders (from end to preserve offsets)
  let annotatedText = cleanedText;
  for (const citation of sortedByOffset) {
    const placeholder = `{{cite:${citation.placeholderId}}}`;
    annotatedText =
      annotatedText.slice(0, citation.charOffset) +
      placeholder +
      annotatedText.slice(citation.charOffset + citation.rawMarker.length);
  }

  return { citations, annotatedText };
}

/**
 * Restore original citation markers from placeholders.
 */
export function restoreCitations(text: string, citations: ExtractedCitation[]): string {
  let result = text;
  for (const citation of citations) {
    const placeholder = `{{cite:${citation.placeholderId}}}`;
    result = result.replace(placeholder, citation.rawMarker);
  }
  return result;
}

/**
 * Verify citation placeholder presence in AI output vs input.
 */
export function verifyCitationPresence(
  inputText: string,
  outputText: string
): { preserved: string[]; dropped: string[]; added: string[] } {
  const inputPlaceholders = new Set(
    [...inputText.matchAll(/\{\{cite:([^}]+)\}\}/g)].map((m) => m[1]!)
  );
  const outputPlaceholders = new Set(
    [...outputText.matchAll(/\{\{cite:([^}]+)\}\}/g)].map((m) => m[1]!)
  );

  const preserved = [...inputPlaceholders].filter((id) => outputPlaceholders.has(id));
  const dropped = [...inputPlaceholders].filter((id) => !outputPlaceholders.has(id));
  const added = [...outputPlaceholders].filter((id) => !inputPlaceholders.has(id));

  return { preserved, dropped, added };
}
