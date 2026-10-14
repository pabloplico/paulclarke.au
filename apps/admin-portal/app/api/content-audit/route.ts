import { generateObject } from 'ai';
import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAiAllowance } from '@/lib/ai/allowance';
import { getModel } from '@/lib/ai/models';
import { AU_ENGLISH } from '@/lib/ai/style';
import { requireAuthApi } from '@/lib/auth/server';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import { adminContentAuditReports, aiStatistics, type ContentAuditFinding } from '@/lib/db/schema';

const BUSINESS_PORTAL_URL = process.env.BUSINESS_PORTAL_URL || 'http://localhost:3000';

// ── GET: latest audit report ─────────────────────────────────────────────────

export async function GET() {
  const user = await requireAuthApi();
  const [report] = await db
    .select()
    .from(adminContentAuditReports)
    .where(eq(adminContentAuditReports.userId, user.id))
    .orderBy(desc(adminContentAuditReports.createdAt))
    .limit(1);

  return NextResponse.json({ report: report ?? null });
}

// ── POST: run content audit ──────────────────────────────────────────────────

export async function POST() {
  const user = await requireAuthApi();
  await requireAiAllowance(user);
  // 1. Fetch blog posts from business-portal API
  let posts: { slug: string; title: string; date: string; content: string }[] = [];
  try {
    const listRes = await fetch(`${BUSINESS_PORTAL_URL}/api/posts`);
    if (!listRes.ok) throw new Error(`Posts list failed: ${listRes.status}`);
    const postList: { slug: string; title: string; date: string }[] = await listRes.json();

    const postResults = await Promise.allSettled(
      postList.map(async (p) => {
        const res = await fetch(`${BUSINESS_PORTAL_URL}/api/posts/${p.slug}`);
        if (!res.ok) return null;
        const data = await res.json();
        return { slug: p.slug, title: data.title, date: data.date, content: data.content };
      })
    );

    posts = postResults
      .filter(
        (r): r is PromiseFulfilledResult<NonNullable<(typeof posts)[0]>> =>
          r.status === 'fulfilled' && r.value != null
      )
      .map((r) => r.value);
  } catch (error) {
    console.error('Failed to fetch blog posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blog posts from business-portal' },
      { status: 502 }
    );
  }

  // 2. Fetch insights data from shared DB
  const insights = await db.select().from(aiStatistics);

  if (posts.length === 0 && insights.length === 0) {
    return NextResponse.json(
      { error: 'No content to audit — no posts or insights found' },
      { status: 422 }
    );
  }

  // 3. Build AI prompt
  const insightsText = insights
    .map((i) => {
      const parts = [`[${i.category}] "${i.title}"`];
      if (i.value) parts.push(`Value: ${i.value}${i.suffix ? ` ${i.suffix}` : ''}`);
      parts.push(i.description);
      if (i.detail) parts.push(`Detail: ${i.detail}`);
      if (i.sourceName) parts.push(`Source: ${i.sourceName} (${i.sourceDate ?? 'no date'})`);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');

  const postsText = posts
    .map((p) => `### ${p.title} (${p.date}, slug: ${p.slug})\n${p.content}`)
    .join('\n\n---\n\n');

  const findingSchema = z.object({
    findings: z.array(
      z.object({
        severity: z.enum(['high', 'medium', 'low']),
        type: z.enum(['conflict', 'unsourced_claim', 'stale_data', 'missing_coverage']),
        postSlug: z.string().nullable(),
        insightCategory: z.string().nullable(),
        claim: z
          .string()
          .describe('The exact quote or near-exact quote from the blog post or insight'),
        issue: z.string().describe('Concise explanation of the problem'),
        suggestion: z.string().describe('Specific, actionable fix'),
      })
    ),
  });

  // 4. Call AI
  const cfg = await loadConfig();
  let findings: ContentAuditFinding[] = [];

  try {
    const { object } = await generateObject({
      model: getModel(cfg),
      schema: findingSchema,
      system: AU_ENGLISH,
      prompt: `You are a fact-checking analyst for a business website. The website has two public content sources:
1. BLOG POSTS — long-form articles published to the blog
2. INSIGHTS DATABASE — curated statistics and data points displayed on the Insights page, each with a verified source citation

Your job: cross-check these sources for factual consistency and identify genuine issues.

## Insights Database (Verified Data)
${insightsText || '(Empty — no insights data)'}

## Blog Posts
${postsText || '(Empty — no blog posts)'}

## Finding Types — Use ONLY when clearly warranted

### "conflict" (severity: "high")
A blog post states a SPECIFIC NUMBER or FACT that directly contradicts a specific number or fact in the insights database on the SAME TOPIC. Both sources must be making a comparable claim.
- Example: Blog says "35% of businesses use AI" but insights says "25% of businesses use AI"
- NOT a conflict: Blog cites a different study with a different number about a related-but-different metric
- NOT a conflict: Blog says something qualitative that roughly aligns with insights data

### "unsourced_claim" (severity: "medium")
A blog post makes a SPECIFIC STATISTICAL CLAIM (a number, percentage, or quantified fact) WITHOUT any attribution — no inline citation, no linked source, no mention of where the data comes from. General opinions, advice, qualitative observations, and marketing copy are NOT unsourced claims.
- Example: "AI adoption increased 40% last year" with no source mentioned anywhere nearby
- NOT unsourced: "AI tools have never been more accessible" (this is an opinion, not a statistical claim)
- NOT unsourced: A statistic that IS attributed to a named source in the same paragraph or section

### "stale_data" (severity: "medium")
A blog post cites a statistic that the insights database has a NEWER, DIFFERENT figure for from a more recent source. The topic must be the same.
- Example: Blog (from 2025) cites a 2023 figure, insights has a 2024 update of the same metric
- NOT stale: Blog cites a different metric from a different source than what's in insights

### "missing_coverage" (severity: "low")
An important insight category has NO corresponding blog content at all, suggesting a content gap worth addressing. Only flag this for major thematic gaps — not for every individual statistic missing from blog posts.
- Example: Insights has a whole "risk" category about AI risks, but no blog post covers AI risks at all
- NOT a gap: A specific statistic from insights isn't mentioned in blog posts (that's normal)

## Rules
- Be STRICT about what counts as a finding. When in doubt, do NOT flag it.
- Quality over quantity — 2 real findings are better than 8 questionable ones.
- Return an EMPTY findings array if everything is consistent. This is a valid and expected outcome.
- For "claim", quote the exact text from the blog post (for post-related findings) or describe the insight (for coverage gaps).
- For "postSlug", use the slug from the post metadata. Null for missing_coverage.
- For "insightCategory", use the category string from the insights data. Null if not applicable.
- For "suggestion", be specific and actionable (e.g., "Add source attribution: Business Chamber Qld 2025 report" not "Consider adding a source").`,
    });

    findings = object.findings;
  } catch (error) {
    console.error('AI content audit failed:', error);
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
  }

  // 5. Sort: high > medium > low
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  // 6. Store report
  const [report] = await db
    .insert(adminContentAuditReports)
    .values({
      findings,
      postsSummary: posts.map((p) => ({ slug: p.slug, title: p.title, date: p.date })),
      insightsSummary: {
        count: insights.length,
        categories: [...new Set(insights.map((i) => i.category))],
      },
      userId: user.id,
    })
    .returning();

  return NextResponse.json({ report });
}
