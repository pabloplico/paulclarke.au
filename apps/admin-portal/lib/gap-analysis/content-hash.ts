import { createHash } from 'node:crypto';

/**
 * Hash section content for staleness detection.
 */
export function hashSectionContent(
  content: string,
  structuredData: Record<string, unknown> | null
): string {
  const data = content + (structuredData ? JSON.stringify(structuredData) : '');
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Hash all section hashes together for workspace-level staleness.
 * Sorts by section ID for deterministic ordering.
 */
export function hashWorkspace(sectionHashes: Record<number, string>): string {
  const sorted = Object.entries(sectionHashes)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, hash]) => hash)
    .join('');
  return createHash('sha256').update(sorted).digest('hex');
}

/**
 * Compare stored section hashes against current ones.
 * Returns a map of sectionId → stale boolean.
 */
export function computeStaleness(
  storedHashes: Record<number, string> | null | undefined,
  currentHashes: Record<number, string>
): Map<number, boolean | undefined> {
  const result = new Map<number, boolean | undefined>();

  if (!storedHashes) {
    // Legacy report — staleness unknown
    for (const sectionId of Object.keys(currentHashes)) {
      result.set(Number(sectionId), undefined);
    }
    return result;
  }

  for (const [sectionIdStr, currentHash] of Object.entries(currentHashes)) {
    const sectionId = Number(sectionIdStr);
    const storedHash = storedHashes[sectionId];
    if (!storedHash) {
      // Section added after report was generated
      result.set(sectionId, true);
    } else {
      result.set(sectionId, storedHash !== currentHash);
    }
  }

  return result;
}
