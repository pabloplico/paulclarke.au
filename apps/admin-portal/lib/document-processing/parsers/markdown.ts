import type { ParseResult } from './index';

export async function parseMarkdown(buffer: Buffer, _filename: string): Promise<ParseResult> {
  let text = buffer.toString('utf-8');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const metadata: Record<string, unknown> = {};

  // Extract YAML frontmatter if present
  const frontmatterMatch = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (frontmatterMatch) {
    metadata.hasFrontmatter = true;
    // Parse simple key: value pairs from frontmatter
    const frontmatter = frontmatterMatch[1]!;
    for (const line of frontmatter.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        metadata[key] = value;
      }
    }
  }

  return { text, metadata: Object.keys(metadata).length > 0 ? metadata : undefined };
}
