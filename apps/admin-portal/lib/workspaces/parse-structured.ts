import type { CardsData, ChecklistData, KvPairsData, TableData } from './types';

/**
 * Parse AI-generated markdown into structured data for non-prose section templates.
 * AI generates markdown (which it's good at), and we convert to the JSON format
 * that section renderers expect.
 */

/**
 * Strip markdown formatting from text, producing plain text suitable for card bodies/titles.
 * Removes bold, italic, bullet points, numbered lists, links, images, etc.
 */
function stripMarkdown(text: string): string {
  return (
    text
      // Remove images ![alt](url)
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Convert links [text](url) to just text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Remove bold/italic markers (must handle *** before ** before *)
      .replace(/\*{3}(.+?)\*{3}/g, '$1')
      .replace(/\*{2}(.+?)\*{2}/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_{2}(.+?)_{2}/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      // Remove inline code backticks
      .replace(/`([^`]+)`/g, '$1')
      // Convert bullet list items to plain lines
      .replace(/^[-*]\s+/gm, '')
      // Convert numbered list items to plain lines
      .replace(/^\d+[.)]\s+/gm, '')
      // Remove blockquote markers
      .replace(/^>\s*/gm, '')
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export function parseMarkdownToCards(markdown: string): CardsData {
  const items: CardsData['items'] = [];

  // Split on h2/h3/h4 headings — these are individual cards.
  // Any content before the first heading (including h1 section title) is skipped.
  const sections = markdown.split(/(?=^#{2,4}\s)/m).filter((s) => s.trim());

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const titleLine = lines[0] ?? '';

    // Skip if this chunk doesn't start with a heading (it's preamble/h1 text)
    if (!/^#{2,4}\s/.test(titleLine)) continue;

    const title = stripMarkdown(titleLine.replace(/^#{1,4}\s*/, '').trim());
    if (!title) continue;

    // Remaining lines are the body
    const bodyLines = lines.slice(1).filter((l) => l.trim());
    const tagLine = bodyLines.find((l) => /^_?tags?:/i.test(l.replace(/^[_*]+/, '')));
    const body = stripMarkdown(
      bodyLines
        .filter((l) => l !== tagLine)
        .join('\n')
        .trim()
    );

    // Extract tags if present
    let tags: string[] = [];
    if (tagLine) {
      const tagContent = tagLine.replace(/^[_*]*tags?:\s*/i, '').replace(/[_*]+$/g, '');
      tags = tagContent
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }

    items.push({ title, body, tags: tags.length > 0 ? tags : undefined });
  }

  // If no headings found, try splitting on horizontal rules or numbered items
  if (items.length === 0) {
    const byRule = markdown.split(/^---+$/m).filter((s) => s.trim());
    if (byRule.length > 1) {
      for (const block of byRule) {
        const lines = block.trim().split('\n');
        // Skip blocks that are just a top-level heading
        if (lines.length === 1 && /^#\s/.test(lines[0] ?? '')) continue;
        const title = stripMarkdown(lines[0]?.replace(/^[#*\-\d.)\s]+/, '').trim() ?? 'Item');
        const body = stripMarkdown(lines.slice(1).join('\n').trim());
        items.push({ title, body });
      }
    } else {
      // Treat the whole thing as one card (but strip any leading h1)
      const cleaned = markdown.replace(/^#\s+.*\n+/, '').trim();
      if (cleaned) {
        items.push({ title: 'Item', body: stripMarkdown(cleaned) });
      }
    }
  }

  return { items };
}

export function parseMarkdownToTable(markdown: string): TableData {
  // Look for markdown table: | col1 | col2 | ... and | --- | --- | ...
  const lines = markdown
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Find the header row (first line with pipes)
  const headerIdx = lines.findIndex((l) => l.startsWith('|') && l.endsWith('|'));
  if (headerIdx === -1) {
    // No markdown table found — try to extract from list items or key-value patterns
    return parseListToTable(markdown);
  }

  const headerLine = lines[headerIdx]!;
  const columns = headerLine
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);

  // Skip separator row (| --- | --- |)
  const dataStartIdx = headerIdx + 2;

  const rows: Record<string, string>[] = [];
  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.startsWith('|')) break;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    const row: Record<string, string> = {};
    columns.forEach((col, j) => {
      row[col] = cells[j] ?? '';
    });
    rows.push(row);
  }

  return { columns, rows };
}

function parseListToTable(markdown: string): TableData {
  // Try to extract tabular data from structured text
  const lines = markdown.split('\n').filter((l) => l.trim());

  // Check for "Key: Value" or "- **Key**: Value" patterns
  const kvPattern = /^[-*\d.)]*\s*\*?\*?(.+?)\*?\*?\s*[:—–-]\s*(.+)$/;
  const pairs: { key: string; value: string }[] = [];

  for (const line of lines) {
    const match = line.trim().match(kvPattern);
    if (match?.[1] && match[2]) {
      pairs.push({ key: match[1].trim(), value: match[2].trim() });
    }
  }

  if (pairs.length >= 2) {
    return {
      columns: ['Name', 'Value'],
      rows: pairs.map((p) => ({ Name: p.key, Value: p.value })),
    };
  }

  // Fallback: single column table with items
  const items = lines
    .map((l) => l.replace(/^[-*\d.)]\s*/, '').trim())
    .filter((l) => l && !l.startsWith('#'));

  if (items.length > 0) {
    return {
      columns: ['Item'],
      rows: items.map((item) => ({ Item: item })),
    };
  }

  return { columns: [], rows: [] };
}

/**
 * listItemsOnly: only bullet, numbered and [ ] lines become items, never
 * headings or paragraphs. For appending to an existing checklist, where a
 * suggestion's heading and intro text would otherwise land as items.
 */
export function parseMarkdownToChecklist(
  markdown: string,
  { listItemsOnly = false }: { listItemsOnly?: boolean } = {}
): ChecklistData {
  const items: ChecklistData['items'] = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Match checklist items: - [ ] text or - [x] text
    const checkMatch = trimmed.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
    if (checkMatch?.[2]) {
      items.push({
        text: stripMarkdown(checkMatch[2].trim()),
        checked: checkMatch[1] !== ' ',
      });
      continue;
    }

    // Match regular list items: - text, * text, 1. text
    const listMatch = trimmed.match(/^[-*]\s+(.+)|^\d+[.)]\s+(.+)/);
    if (listMatch) {
      const text = stripMarkdown((listMatch[1] ?? listMatch[2] ?? '').trim());
      if (text) {
        items.push({ text, checked: false });
      }
    }
  }

  // If no list items found, split on newlines and treat each as an item
  if (items.length === 0 && !listItemsOnly) {
    const textLines = markdown
      .split('\n')
      .map((l) => l.replace(/^#+\s*/, '').trim())
      .filter((l) => l.length > 5);

    for (const text of textLines) {
      items.push({ text, checked: false });
    }
  }

  return { items };
}

export function parseMarkdownToKvPairs(markdown: string): KvPairsData {
  const pairs: KvPairsData['pairs'] = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Match "**Key**: Value" or "Key: Value" or "- Key: Value"
    const match = trimmed.match(/^[-*]*\s*\*?\*?(.+?)\*?\*?\s*[:—–]\s*(.+)$/);
    if (match?.[1] && match[2]) {
      pairs.push({
        key: stripMarkdown(match[1].trim()),
        value: stripMarkdown(match[2].trim()),
      });
    }
  }

  return { pairs };
}

/**
 * Adds parsed incoming data to a structured section's current data, for an
 * "append" approval: the existing items, rows or pairs stay and the new ones
 * follow. Table rows line up by column name (ignoring case); an incoming
 * column the table doesn't have yet is added at the end. With no usable
 * current data, the incoming data is returned as it is.
 */
export function mergeStructuredData(
  template: string,
  current: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  switch (template) {
    case 'checklist':
    case 'cards': {
      const existing = (current as ChecklistData | CardsData | null)?.items;
      const added = (incoming as ChecklistData | CardsData).items ?? [];
      return Array.isArray(existing) ? { ...current, items: [...existing, ...added] } : incoming;
    }
    case 'kv-pairs': {
      const existing = (current as KvPairsData | null)?.pairs;
      const added = (incoming as KvPairsData).pairs ?? [];
      return Array.isArray(existing) ? { ...current, pairs: [...existing, ...added] } : incoming;
    }
    case 'table': {
      const table = current as TableData | null;
      if (!Array.isArray(table?.columns) || !Array.isArray(table?.rows)) return incoming;
      const added = incoming as TableData;
      const columns = [...table.columns];
      const columnFor = (name: string) => {
        const match = columns.find((c) => c.toLowerCase() === name.toLowerCase());
        if (match) return match;
        columns.push(name);
        return name;
      };
      const rows = (added.rows ?? []).map((row) => {
        const mapped: Record<string, string> = {};
        for (const [name, value] of Object.entries(row)) mapped[columnFor(name)] = value;
        return mapped;
      });
      return { ...table, columns, rows: [...table.rows, ...rows] };
    }
    default:
      return incoming;
  }
}
