import type { CompletenessRule, GapFinding } from '@/lib/db/schema';

export interface SectionInput {
  id: number;
  title: string;
  template: string;
  completenessRules: CompletenessRule[] | null;
  staleDependencies?: { targetTitle: string; relationType: string }[];
}

/**
 * Run rule-based gap checks on a single section.
 * Returns an array of findings (empty if the section passes all checks).
 */
export function checkRules(
  section: SectionInput,
  content: string,
  structuredData: Record<string, unknown> | null,
  hasChildren = false
): GapFinding[] {
  const findings: GapFinding[] = [];
  const rules = section.completenessRules ?? [];

  for (const rule of rules) {
    switch (rule.type) {
      case 'min_length': {
        const minLen = (rule.params.minLength as number) ?? 200;
        if (content.length < minLen) {
          findings.push({
            sectionId: section.id,
            sectionTitle: section.title,
            severity: content.length < minLen / 2 ? 'high' : 'medium',
            issue: `Content is too short (${content.length} chars, minimum ${minLen})`,
            suggestion: rule.description || `Expand this section to at least ${minLen} characters`,
            ruleType: 'min_length',
          });
        }
        break;
      }
      case 'required_headings': {
        const headings = (rule.params.headings as string[]) ?? [];
        const missing = headings.filter((h) => !content.includes(h));
        if (missing.length > 0) {
          findings.push({
            sectionId: section.id,
            sectionTitle: section.title,
            severity: missing.length > headings.length / 2 ? 'high' : 'medium',
            issue: `Missing headings: ${missing.join(', ')}`,
            suggestion: rule.description || `Add sections for: ${missing.join(', ')}`,
            ruleType: 'required_headings',
          });
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
        if (itemCount < minItems) {
          findings.push({
            sectionId: section.id,
            sectionTitle: section.title,
            severity: itemCount === 0 ? 'high' : 'medium',
            issue: `Only ${itemCount} items (minimum ${minItems})`,
            suggestion: rule.description || `Add at least ${minItems - itemCount} more items`,
            ruleType: 'min_items',
          });
        }
        break;
      }
    }
  }

  // Stale dependency check
  if (section.staleDependencies && section.staleDependencies.length > 0) {
    const staleNames = section.staleDependencies.map((d) => d.targetTitle).join(', ');
    findings.push({
      sectionId: section.id,
      sectionTitle: section.title,
      severity: 'medium',
      issue: `Depends on recently updated section(s): ${staleNames}`,
      suggestion: `Review this section — its source (${staleNames}) has been updated since this was last edited`,
      ruleType: 'stale_dependency',
    });
  }

  // Basic checks even without explicit rules
  if (rules.length === 0) {
    // Check if structured data has actual content
    const hasStructuredContent =
      structuredData &&
      ((Array.isArray((structuredData as { items?: unknown[] }).items) &&
        (structuredData as { items: unknown[] }).items.length > 0) ||
        (Array.isArray((structuredData as { rows?: unknown[] }).rows) &&
          (structuredData as { rows: unknown[] }).rows.length > 0) ||
        (Array.isArray((structuredData as { pairs?: unknown[] }).pairs) &&
          (structuredData as { pairs: unknown[] }).pairs.length > 0));

    if (!content && !hasStructuredContent) {
      // Parent sections often serve as containers — empty parents with children are low severity
      findings.push({
        sectionId: section.id,
        sectionTitle: section.title,
        severity: hasChildren ? 'low' : 'high',
        issue: hasChildren ? 'Parent section has no content of its own' : 'Section is empty',
        suggestion: hasChildren
          ? 'Consider adding a brief overview or leave as an organizational container'
          : 'Add initial content to this section',
      });
    } else if (!hasStructuredContent && content.length > 0 && content.length < 50) {
      findings.push({
        sectionId: section.id,
        sectionTitle: section.title,
        severity: hasChildren ? 'low' : 'medium',
        issue: 'Section has very little content',
        suggestion: 'Expand this section with more detail',
      });
    }
  }

  return findings;
}
