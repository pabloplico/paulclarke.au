import { generateObject } from 'ai';
import { desc, eq, inArray } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAiAllowance } from '@/lib/ai/allowance';
import { getModel } from '@/lib/ai/models';
import { enforceBudget, estimateTokens } from '@/lib/ai/tokens';
import { logAIUsage } from '@/lib/ai/usage-logger';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import {
  adminGapReports,
  adminSectionDependencies,
  adminWorkspaceSections,
  type GapFinding,
} from '@/lib/db/schema';
import { checkRules } from '@/lib/gap-analysis/check-rules';
import {
  computeStaleness,
  hashSectionContent,
  hashWorkspace,
} from '@/lib/gap-analysis/content-hash';
import { getLatestVersions } from '@/lib/workspaces/latest-versions';
import { isDependencyStale } from '@/lib/workspaces/staleness';

type Params = { params: Promise<{ id: string }> };

// ── GET: latest report ──────────────────────────────────────────────────────

export async function GET(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const [report] = await db
    .select({
      id: adminGapReports.id,
      workspaceId: adminGapReports.workspaceId,
      findings: adminGapReports.findings,
      sectionContentHashes: adminGapReports.sectionContentHashes,
      createdAt: adminGapReports.createdAt,
    })
    .from(adminGapReports)
    .where(eq(adminGapReports.workspaceId, workspace.id))
    .orderBy(desc(adminGapReports.createdAt))
    .limit(1);

  if (!report) {
    return NextResponse.json({ report: null });
  }

  // Compute staleness at read time by comparing stored hashes to current content
  let staleSections: number[] = [];
  if (report.sectionContentHashes) {
    const sections = await db
      .select()
      .from(adminWorkspaceSections)
      .where(eq(adminWorkspaceSections.workspaceId, workspace.id));

    const versionMap = await getLatestVersions(sections.map((s) => s.id));
    const currentHashes: Record<number, string> = {};
    for (const section of sections) {
      const latest = versionMap.get(section.id);
      currentHashes[section.id] = hashSectionContent(
        latest?.content ?? '',
        (latest?.structuredData as Record<string, unknown>) ?? null
      );
    }

    const stalenessMap = computeStaleness(report.sectionContentHashes, currentHashes);
    staleSections = [...stalenessMap.entries()]
      .filter(([, stale]) => stale === true)
      .map(([sectionId]) => sectionId);
  }

  // Annotate findings with staleness
  const annotatedFindings = report.findings.map((f: GapFinding) => ({
    ...f,
    stale: staleSections.includes(f.sectionId),
  }));

  return NextResponse.json({
    report: { ...report, findings: annotatedFindings },
    staleSections,
  });
}

// ── POST: run analysis ──────────────────────────────────────────────────────

export async function POST(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  await requireAiAllowance(resolved.user);
  const { workspace } = resolved;

  // Load all sections with latest content
  const sections = await db
    .select()
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.workspaceId, workspace.id))
    .orderBy(adminWorkspaceSections.sortOrder);

  const versionMap = await getLatestVersions(sections.map((s) => s.id));
  const sectionData = sections.map((section) => {
    const latest = versionMap.get(section.id);
    return {
      section,
      content: latest?.content ?? '',
      structuredData: latest?.structuredData ?? null,
    };
  });

  // Load dependency staleness for all sections (batch query to avoid N+1)
  const sectionStaleDeps = new Map<number, { targetTitle: string; relationType: string }[]>();
  const sectionIds = sectionData.map((s) => s.section.id);

  if (sectionIds.length > 0) {
    const allDepRows = await db
      .select({
        sectionId: adminSectionDependencies.sectionId,
        relationType: adminSectionDependencies.relationType,
        targetTitle: adminWorkspaceSections.title,
        targetUpdatedAt: adminWorkspaceSections.updatedAt,
      })
      .from(adminSectionDependencies)
      .innerJoin(
        adminWorkspaceSections,
        eq(adminSectionDependencies.dependsOnSectionId, adminWorkspaceSections.id)
      )
      .where(inArray(adminSectionDependencies.sectionId, sectionIds));

    // Group deps by sectionId
    const depsBySectionId = new Map<number, typeof allDepRows>();
    for (const row of allDepRows) {
      let group = depsBySectionId.get(row.sectionId);
      if (!group) {
        group = [];
        depsBySectionId.set(row.sectionId, group);
      }
      group.push(row);
    }

    // Filter for stale dependencies per section
    for (const { section } of sectionData) {
      const deps = depsBySectionId.get(section.id);
      if (!deps) continue;

      const stale = deps.filter((d) =>
        isDependencyStale({
          sectionUpdatedAt: section.updatedAt,
          dependsOnUpdatedAt: d.targetUpdatedAt,
        })
      );

      if (stale.length > 0) {
        sectionStaleDeps.set(
          section.id,
          stale.map((d) => ({ targetTitle: d.targetTitle, relationType: d.relationType }))
        );
      }
    }
  }

  // Phase 1: Rule-based checks
  const childrenByParent = new Set(
    sections.filter((s) => s.parentSectionId != null).map((s) => s.parentSectionId)
  );
  const ruleFindings: GapFinding[] = [];
  for (const { section, content, structuredData } of sectionData) {
    const staleDependencies = sectionStaleDeps.get(section.id);
    const hasChildren = childrenByParent.has(section.id);
    ruleFindings.push(
      ...checkRules({ ...section, staleDependencies }, content, structuredData, hasChildren)
    );
  }

  // Phase 2: AI analysis for deeper gaps
  // Compute content hashes for staleness tracking
  const sectionContentHashes: Record<number, string> = {};
  for (const { section, content, structuredData } of sectionData) {
    sectionContentHashes[section.id] = hashSectionContent(
      content,
      structuredData as Record<string, unknown>
    );
  }
  const workspaceContentHash = hashWorkspace(sectionContentHashes);

  // Build parent title map for context
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const cfg = await loadConfig();

  // Token-aware budget allocation: proportionally distribute tokens across sections
  const totalBudgetTokens = 8_000; // conservative budget for section previews
  const sectionTokenCounts = sectionData.map(({ content }) =>
    estimateTokens(content, cfg.ai.model)
  );
  const totalContentTokens = sectionTokenCounts.reduce((sum, t) => sum + t, 0);

  const sectionSummaries = sectionData
    .map(({ section, content, structuredData }, idx) => {
      // Proportional budget per section with a minimum floor
      const sectionTokens = sectionTokenCounts[idx] ?? 0;
      const proportionalBudget =
        totalContentTokens > 0
          ? Math.max(100, Math.floor((sectionTokens / totalContentTokens) * totalBudgetTokens))
          : 200;

      const budgetResult = enforceBudget(
        content,
        { maxInputTokens: proportionalBudget, reserveOutputTokens: 0, strategy: 'truncate' },
        cfg.ai.model
      );
      let preview = budgetResult.text;
      // For structured sections, include actual data so the AI can assess completeness
      if (structuredData) {
        const sd = structuredData;
        if (Array.isArray(sd.columns) && Array.isArray(sd.rows) && sd.rows.length > 0) {
          const cols = sd.columns as string[];
          const rows = sd.rows as Record<string, string>[];
          const header = `| ${cols.join(' | ')} |`;
          const sep = `| ${cols.map(() => '---').join(' | ')} |`;
          const dataRows = rows
            .slice(0, 25)
            .map((r) => `| ${cols.map((c) => (r[c] ?? '').slice(0, 60)).join(' | ')} |`);
          const tablePreview = [header, sep, ...dataRows].join('\n');
          const suffix = rows.length > 25 ? `\n(${rows.length} rows total, showing first 25)` : '';
          preview = preview ? `${preview}\n\n${tablePreview}${suffix}` : `${tablePreview}${suffix}`;
        } else if (Array.isArray(sd.items) && sd.items.length > 0) {
          const items = sd.items as Record<string, string>[];
          const itemPreview = items
            .slice(0, 15)
            .map((item) => `- ${item.title || item.text || JSON.stringify(item).slice(0, 80)}`)
            .join('\n');
          const suffix =
            items.length > 15 ? `\n(${items.length} items total, showing first 15)` : '';
          preview = preview ? `${preview}\n\n${itemPreview}${suffix}` : `${itemPreview}${suffix}`;
        } else if (Array.isArray(sd.pairs) && sd.pairs.length > 0) {
          const pairs = sd.pairs as { key: string; value: string }[];
          const pairPreview = pairs.map((p) => `- **${p.key}**: ${p.value}`).join('\n');
          preview = preview ? `${preview}\n\n${pairPreview}` : pairPreview;
        }
      }
      const parentTitle = section.parentSectionId
        ? sectionById.get(section.parentSectionId)?.title
        : null;
      const depth = section.parentSectionId
        ? (parentTitle ? 1 : 0) +
          (sectionById.get(section.parentSectionId!)?.parentSectionId ? 1 : 0)
        : 0;
      const depthLabel = depth > 0 ? `, depth ${depth}` : '';
      const parentLabel = parentTitle ? `, child of "${parentTitle}"` : '';
      const childLabel = childrenByParent.has(section.id) ? ', has children' : '';
      return `### ${section.title} (${section.template}${parentLabel}${depthLabel}${childLabel})
${preview || '(empty)'}`;
    })
    .join('\n\n');

  const findingSchema = z.object({
    findings: z.array(
      z.object({
        sectionTitle: z.string().describe('Title of the section with a gap'),
        severity: z.enum(['low', 'medium', 'high']).describe('Severity of the gap'),
        issue: z.string().describe('Brief description of what is missing or underdeveloped'),
        suggestion: z.string().describe('Specific suggestion for what to add or improve'),
      })
    ),
  });

  let aiFindings: GapFinding[] = [];
  try {
    const startTime = Date.now();
    const { object, usage } = await generateObject({
      model: getModel(cfg),
      schema: findingSchema,
      prompt: `You are a knowledge base quality analyst. Analyze the workspace "${workspace.title}" and identify content gaps — areas that are thin, missing important details, outdated, or incomplete.

## Workspace Description
${workspace.description || 'No description'}

## Sections
${sectionSummaries}

## Instructions
- Identify 2-5 meaningful gaps (not nitpicks)
- Focus on business-critical missing information
- "high" severity = essential information is missing or section is nearly empty
- "medium" severity = content exists but lacks important details
- "low" severity = content is decent but could be improved
- Sections marked "has children" at depth 0 often serve as organizational containers — an empty parent section is not necessarily a gap if its children contain the content
- Only flag issues that would genuinely hurt if someone relied on this workspace for business decisions
- Do NOT duplicate issues already caught by rule checks: ${ruleFindings.map((f) => f.issue).join('; ') || 'none'}`,
    });

    logAIUsage({
      stage: 'gap-analysis',
      model: cfg.ai.model,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
      latencyMs: Date.now() - startTime,
    });

    // Map AI findings to include sectionId (fuzzy match on title)
    aiFindings = object.findings.map((f) => {
      const titleLower = f.sectionTitle.toLowerCase();
      const matchedSection = sections.find(
        (s) =>
          s.title.toLowerCase() === titleLower ||
          titleLower.startsWith(s.title.toLowerCase()) ||
          titleLower.includes(s.title.toLowerCase())
      );
      return {
        sectionId: matchedSection?.id ?? 0,
        sectionTitle: matchedSection?.title ?? f.sectionTitle,
        severity: f.severity,
        issue: f.issue,
        suggestion: f.suggestion,
      };
    });
  } catch (error) {
    console.error('AI gap analysis failed:', error);
    // Continue with just rule-based findings
  }

  // Merge and deduplicate findings — prefer AI findings over rule-based for same section
  const ruleSectionIds = new Set(ruleFindings.map((f) => f.sectionId));
  const deduplicatedAi = aiFindings.filter((f) => {
    // If rule-based already flagged this section as empty, replace with the more descriptive AI finding
    if (f.sectionId > 0 && ruleSectionIds.has(f.sectionId)) {
      // Remove the rule-based finding for this section and keep the AI one
      const ruleIdx = ruleFindings.findIndex((rf) => rf.sectionId === f.sectionId);
      if (ruleIdx >= 0) {
        ruleFindings.splice(ruleIdx, 1);
      }
    }
    return f.sectionId > 0 || !ruleSectionIds.has(0);
  });
  const allFindings = [...ruleFindings, ...deduplicatedAi];

  // Sort: high > medium > low
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  allFindings.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  // Attach content hash to each finding for per-finding staleness
  const findingsWithHashes: GapFinding[] = allFindings.map((f) => ({
    ...f,
    contentHashAtAnalysis: f.sectionId ? sectionContentHashes[f.sectionId] : undefined,
  }));

  // Save report with content hashes for staleness tracking
  const [report] = await db
    .insert(adminGapReports)
    .values({
      workspaceId: workspace.id,
      findings: findingsWithHashes,
      workspaceContentHash,
      sectionContentHashes,
    })
    .returning();

  return NextResponse.json({ report });
}
