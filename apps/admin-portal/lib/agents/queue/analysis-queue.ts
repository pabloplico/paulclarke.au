import { type Job, Queue, Worker } from 'bullmq';
import { desc, eq, max } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  adminAgentRuns,
  adminAgentTasks,
  adminFindings,
  adminSectionVersions,
  adminWorkspaceSections,
  adminWorkspaces,
} from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import { getRedis } from '@/lib/redis';
import { createAnalysisAgent } from '../mastra/agents/create';
import { getModel } from '../mastra/provider';
import { loadResearchSettings } from '../settings';
import { publishRunComplete, publishRunLog } from './run-logger';

type AnalysisJobData = { taskId: number; userId: number };

let analysisQueue: Queue<AnalysisJobData> | null = null;

/** The mr-analysis queue, created (and connected to Redis) on first use. */
export function getAnalysisQueue(): Queue<AnalysisJobData> {
  analysisQueue ??= new Queue<AnalysisJobData>('mr-analysis', {
    connection: getRedis('Analysis agents'),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 300_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });
  return analysisQueue;
}

// ── Section tree helpers ────────────────────────────────────────────────────

interface SectionInfo {
  id: number;
  slug: string;
  title: string;
  template: string;
  parentSectionId: number | null;
  sortOrder: number;
  content: string | null;
}

/** Build a text representation of the workspace section tree for the AI prompt. */
function buildSectionTreePrompt(sections: SectionInfo[]): string {
  const byParent = new Map<number | null, SectionInfo[]>();
  for (const s of sections) {
    const key = s.parentSectionId;
    const list = byParent.get(key) ?? [];
    list.push(s);
    byParent.set(key, list);
  }

  function render(parentId: number | null, depth: number): string {
    const children = byParent.get(parentId) ?? [];
    children.sort((a, b) => a.sortOrder - b.sortOrder);
    return children
      .map((s) => {
        const indent = '  '.repeat(depth);
        const templateTag = s.template !== 'prose' ? ` [${s.template}]` : '';
        const contentPreview = s.content
          ? `\n${indent}  Current content: ${s.content.slice(0, 200)}${s.content.length > 200 ? '...' : ''}`
          : `\n${indent}  (empty)`;
        const childrenText = render(s.id, depth + 1);
        return `${indent}- "${s.title}" (slug: ${s.slug})${templateTag}${contentPreview}${childrenText ? `\n${childrenText}` : ''}`;
      })
      .join('\n');
  }

  return render(null, 0);
}

/** Normalize a title for fuzzy matching — strip numbering prefixes, lowercase, trim. */
function normalizeTitle(title: string): string {
  return title
    .replace(/^\d+\.\s*/, '') // "1. Executive Summary" → "Executive Summary"
    .replace(/^[A-Z]\.\s*/, '') // "A. Key trend" → "Key trend"
    .replace(/^#{1,3}\s*/, '') // "## Heading" → "Heading"
    .trim()
    .toLowerCase();
}

/** Find the best matching existing section for an AI-generated heading. */
function findMatchingSection(heading: string, sections: SectionInfo[]): SectionInfo | undefined {
  const normalized = normalizeTitle(heading);
  // Exact normalized match
  const exact = sections.find((s) => normalizeTitle(s.title) === normalized);
  if (exact) return exact;

  // Slug match
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const bySlug = sections.find((s) => s.slug === slug);
  if (bySlug) return bySlug;

  // Substring containment (one contains the other)
  const byContains = sections.find((s) => {
    const nt = normalizeTitle(s.title);
    return nt.includes(normalized) || normalized.includes(nt);
  });
  return byContains;
}

// ── AI output parser ────────────────────────────────────────────────────────

interface ParsedSection {
  heading: string;
  content: string;
  level: number; // 1=H1, 2=H2, 3=H3
}

/** Parse the AI output into a flat list of sections with heading levels preserved. */
function parseAIOutput(text: string): ParsedSection[] {
  const lines = text.split('\n');
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      if (current) sections.push(current);
      current = {
        heading: (headingMatch[2] ?? '').trim(),
        content: '',
        level: (headingMatch[1] ?? '#').length,
      };
    } else if (current) {
      current.content += (current.content ? '\n' : '') + line;
    }
  }
  if (current) sections.push(current);

  // Trim trailing whitespace from content
  for (const s of sections) {
    s.content = s.content.trim();
  }

  return sections;
}

/** Slugify a heading for new section creation. */
function slugify(text: string): string {
  return normalizeTitle(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

// ── Template formatting hints ───────────────────────────────────────────────

function templateInstructions(template: string): string {
  switch (template) {
    case 'cards':
      return 'Format as a series of items, each with a bold **Title** on its own line followed by a description paragraph.';
    case 'table':
      return 'Format as a markdown table with | column | headers | and rows.';
    case 'checklist':
      return 'Format as a markdown checklist with - [ ] item lines.';
    case 'kv-pairs':
      return 'Format as key-value pairs, one per line: **Key**: Value';
    default:
      return 'Write in flowing prose with markdown formatting.';
  }
}

// ── Worker ──────────────────────────────────────────────────────────────────

let analysisWorker: Worker<AnalysisJobData> | null = null;

/** Starts the mr-analysis worker. Called from instrumentation, and only when Redis is on. */
export function startAnalysisWorker(): Worker<AnalysisJobData> {
  if (analysisWorker) return analysisWorker;
  const worker = new Worker<AnalysisJobData>(
    'mr-analysis',
    async (job: Job<AnalysisJobData>) => {
      const { taskId, userId } = job.data;

      const [task] = await db.select().from(adminAgentTasks).where(eq(adminAgentTasks.id, taskId));
      if (!task) throw new Error(`Task ${taskId} not found`);

      const [workspace] = await db
        .select()
        .from(adminWorkspaces)
        .where(eq(adminWorkspaces.id, task.workspaceId));
      if (!workspace) throw new Error(`Workspace ${task.workspaceId} not found`);

      const [run] = await db
        .insert(adminAgentRuns)
        .values({ taskId, userId, status: 'started' })
        .returning();
      if (!run) throw new Error('Failed to create run record');

      try {
        const settings = await loadResearchSettings(userId);
        await publishRunLog(run.id, 'Loading workspace structure and findings...');

        // ── Load workspace sections with latest content ──────────────────────
        const rawSections = await db
          .select()
          .from(adminWorkspaceSections)
          .where(eq(adminWorkspaceSections.workspaceId, workspace.id))
          .orderBy(adminWorkspaceSections.sortOrder);

        const sectionsWithContent: SectionInfo[] = await Promise.all(
          rawSections.map(async (s) => {
            const [latestVersion] = await db
              .select({ content: adminSectionVersions.content })
              .from(adminSectionVersions)
              .where(eq(adminSectionVersions.sectionId, s.id))
              .orderBy(desc(adminSectionVersions.version))
              .limit(1);
            return {
              id: s.id,
              slug: s.slug,
              title: s.title,
              template: s.template,
              parentSectionId: s.parentSectionId,
              sortOrder: s.sortOrder,
              content: latestVersion?.content ?? null,
            };
          })
        );

        // ── Load findings ────────────────────────────────────────────────────
        const findings = await db
          .select()
          .from(adminFindings)
          .where(eq(adminFindings.workspaceId, task.workspaceId))
          .orderBy(desc(adminFindings.createdAt))
          .limit(200);

        if (findings.length === 0) {
          await db
            .update(adminAgentRuns)
            .set({ status: 'completed', completedAt: new Date(), findingsCount: 0 })
            .where(eq(adminAgentRuns.id, run.id));
          await publishRunLog(run.id, 'No findings available for analysis. Skipping.');
          await publishRunComplete(run.id, 'completed');
          return { sectionsWritten: 0 };
        }

        const findingsSummary = findings
          .map(
            (f, i) =>
              `[${i + 1}] (${f.findingType}, confidence: ${f.confidenceScore}) ${f.title}\n${f.content}`
          )
          .join('\n\n---\n\n');

        const sectionTreePrompt = buildSectionTreePrompt(sectionsWithContent);
        const industry =
          (workspace.metadata as Record<string, unknown>)?.industry ??
          workspace.category ??
          'general';

        await publishRunLog(
          run.id,
          `Analyzing ${findings.length} findings across ${sectionsWithContent.length} sections...`
        );

        // ── Build prompt that respects workspace structure ────────────────────
        const rootSections = sectionsWithContent.filter((s) => s.parentSectionId === null);
        const sectionInstructions = rootSections
          .map((s) => {
            const children = sectionsWithContent.filter((c) => c.parentSectionId === s.id);
            const childNote =
              children.length > 0
                ? ` (has ${children.length} sub-sections: ${children.map((c) => c.title).join(', ')})`
                : '';
            return `- ## ${s.title}${childNote}\n  Template: ${s.template}. ${templateInstructions(s.template)}`;
          })
          .join('\n');

        const agent = createAnalysisAgent(
          getModel({ provider: settings.aiProvider, model: settings.aiModel })
        );

        const result = await agent.generate(
          `You are updating an existing workspace with research analysis. The workspace "${workspace.title}" (industry: ${industry}) has the following section structure:

${sectionTreePrompt}

IMPORTANT RULES:
1. Write content ONLY for the existing sections listed above. Use their EXACT titles as ## headings.
2. Do NOT create new top-level sections. If you have insights that don't fit, add them to the most relevant existing section.
3. If a section already has content, your output will REPLACE it — so incorporate any important existing points.
4. If a section has sub-sections (children), write a brief intro under the parent heading, then use ### headings for each child section using their exact titles.
5. Respect section templates:
${sectionInstructions}
6. If a section has no relevant findings, write a brief note like "No relevant findings identified yet." — do not skip it.
7. CITE your sources: when you use information from a finding, include its number in square brackets like [1], [3], [7]. You can cite multiple findings: [1][3]. Every substantive claim should be cited.

Format your response as:
## Section Title
Content for this section with citations [1][3]...

### Sub-section Title (if the section has children)
Content for the sub-section [5][7]...

RESEARCH FINDINGS (${findings.length} total):
${findingsSummary}`,
          { maxSteps: 5 }
        );

        const reportText = result.text || '';
        const parsedSections = parseAIOutput(reportText);

        await publishRunLog(
          run.id,
          `Parsed ${parsedSections.length} sections from analysis output`
        );

        // ── Match parsed sections to existing workspace sections and write ────
        let sectionsWritten = 0;

        // Group parsed sections: H2 = root section, H3 = child section
        let currentParent: SectionInfo | null = null;

        for (const parsed of parsedSections) {
          if (!parsed.content && parsed.level <= 2) {
            // Heading-only H2 — set as current parent context, content may be in children
          }

          let targetSection: SectionInfo | undefined;

          if (parsed.level <= 2) {
            // Top-level section — match against root sections
            targetSection = findMatchingSection(parsed.heading, rootSections);
            currentParent = targetSection ?? null;
          } else {
            // Sub-section — match against children of current parent
            if (currentParent) {
              const children = sectionsWithContent.filter(
                (s) => s.parentSectionId === currentParent?.id
              );
              targetSection = findMatchingSection(parsed.heading, children);

              // If no child match, create as new child section
              if (!targetSection && parsed.content) {
                const slug = slugify(parsed.heading);
                if (!slug) continue;

                const maxSort = sectionsWithContent
                  .filter((s) => s.parentSectionId === currentParent?.id)
                  .reduce((m, s) => Math.max(m, s.sortOrder), -1);

                const [newSection] = await db
                  .insert(adminWorkspaceSections)
                  .values({
                    workspaceId: workspace.id,
                    slug,
                    title: normalizeTitle(parsed.heading).replace(/\b\w/g, (c) => c.toUpperCase()),
                    template: currentParent.template,
                    parentSectionId: currentParent.id,
                    sortOrder: maxSort + 1,
                  })
                  .returning();

                if (newSection) {
                  const info: SectionInfo = {
                    ...newSection,
                    content: null,
                  };
                  sectionsWithContent.push(info);
                  targetSection = info;
                }
              }
            } else {
              // No parent context — try matching against all sections
              targetSection = findMatchingSection(parsed.heading, sectionsWithContent);
            }
          }

          if (!targetSection || !parsed.content) continue;

          // Extract finding citations [N] from content and map to real finding IDs
          const citationRegex = /\[(\d+)\]/g;
          const citedIndices = new Set<number>();
          let citationMatch = citationRegex.exec(parsed.content);
          while (citationMatch) {
            citedIndices.add(parseInt(citationMatch[1]!, 10));
            citationMatch = citationRegex.exec(parsed.content);
          }
          const findingRefs = [...citedIndices]
            .map((idx) => findings[idx - 1]?.id) // prompt indices are 1-based
            .filter((id): id is number => id != null);

          // Build structuredData with finding refs (preserve existing structured data)
          const structuredData: Record<string, unknown> = {};
          if (findingRefs.length > 0) {
            structuredData.findingRefs = findingRefs;
          }

          // Write new version
          const [maxVersionRow] = await db
            .select({ maxVersion: max(adminSectionVersions.version) })
            .from(adminSectionVersions)
            .where(eq(adminSectionVersions.sectionId, targetSection.id));
          const nextVersion = (maxVersionRow?.maxVersion ?? 0) + 1;

          // Strip citation markers from content for clean display
          const cleanContent = parsed.content.replace(/\[(\d+)\]/g, '');

          await db.insert(adminSectionVersions).values({
            sectionId: targetSection.id,
            version: nextVersion,
            content: cleanContent,
            structuredData: Object.keys(structuredData).length > 0 ? structuredData : undefined,
            changeDescription: `AI research analysis (run #${run.id})`,
            changeSource: 'ai_research',
          });

          // Update our local cache so subsequent sections know about the new content
          targetSection.content = parsed.content;
          sectionsWritten++;

          await publishRunLog(run.id, `Updated "${targetSection.title}" (v${nextVersion})`);
        }

        await db
          .update(adminAgentRuns)
          .set({
            status: 'completed',
            completedAt: new Date(),
            tokensUsed: result.usage?.totalTokens ?? 0,
          })
          .where(eq(adminAgentRuns.id, run.id));

        await publishRunLog(
          run.id,
          `Analysis complete. ${sectionsWritten} sections updated, ${result.usage?.totalTokens ?? 0} tokens used`
        );
        await publishRunComplete(run.id, 'completed');

        return { sectionsWritten };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await db
          .update(adminAgentRuns)
          .set({ status: 'failed', completedAt: new Date(), errorLog: errorMsg })
          .where(eq(adminAgentRuns.id, run.id));
        await publishRunComplete(run.id, 'failed');
        throw error;
      }
    },
    { connection: getRedis('Analysis agents'), concurrency: 1 }
  );

  const workerLog = logger.child({ module: 'mr-analysis' });
  worker.on('completed', (job) => {
    workerLog.info('Job completed', { jobId: job.id });
  });
  worker.on('failed', (job, err) => {
    workerLog.error('Job failed', { jobId: job?.id, error: err.message });
  });

  analysisWorker = worker;
  return worker;
}
