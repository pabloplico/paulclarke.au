import type { CompletenessRule } from '@/lib/db/schema';

export interface SectionCompletenessInput {
  content: string | null;
  structuredData: Record<string, unknown> | null;
  completenessRules: CompletenessRule[] | null;
}

/**
 * Check whether a single section passes all its completeness rules.
 * Returns true if the section is considered "complete".
 */
export function computeSectionComplete(
  content: string | null,
  structuredData: Record<string, unknown> | null,
  rules: CompletenessRule[] | null
): boolean {
  const text = content ?? '';
  const ruleList = rules ?? [];

  if (ruleList.length === 0) {
    // No explicit rules — complete if there's meaningful content
    const hasStructuredContent = hasItems(structuredData);
    return text.length >= 50 || hasStructuredContent;
  }

  // All rules must pass
  for (const rule of ruleList) {
    switch (rule.type) {
      case 'min_length': {
        const minLen = (rule.params.minLength as number) ?? 200;
        if (text.length < minLen) return false;
        break;
      }
      case 'required_headings': {
        const headings = (rule.params.headings as string[]) ?? [];
        for (const h of headings) {
          if (!text.includes(h)) return false;
        }
        break;
      }
      case 'min_items': {
        const minItems = (rule.params.minItems as number) ?? 3;
        let itemCount = 0;
        if (structuredData) {
          const items = structuredData.items ?? structuredData.rows ?? structuredData.pairs;
          if (Array.isArray(items)) itemCount = items.length;
        }
        if (itemCount < minItems) return false;
        break;
      }
    }
  }

  return true;
}

/**
 * Compute workspace completeness as a percentage (0–100).
 * Returns the ratio of sections passing their rules to total sections.
 */
export function computeWorkspaceCompleteness(sections: SectionCompletenessInput[]): number {
  if (sections.length === 0) return 0;
  const passing = sections.filter((s) =>
    computeSectionComplete(s.content, s.structuredData, s.completenessRules)
  ).length;
  return Math.round((passing / sections.length) * 100);
}

function hasItems(data: Record<string, unknown> | null): boolean {
  if (!data) return false;
  for (const key of ['items', 'rows', 'pairs']) {
    if (Array.isArray(data[key]) && (data[key] as unknown[]).length > 0) return true;
  }
  return false;
}
