import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import {
  adminFindings,
  adminSectionVersions,
  adminWorkspaceSections,
  adminWorkspaces,
} from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  const user = await requireAuthApi();
  const q = request.nextUrl.searchParams.get('q')?.trim();
  const config = await loadConfig();

  if (!q || q.length < config.search.minQueryLength) {
    return NextResponse.json({ results: [] });
  }

  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page')) || 1);
  const limit = Math.min(
    50,
    Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || config.search.maxResults)
  );
  const offset = (page - 1) * limit;

  const pattern = `%${q}%`;

  // Use DISTINCT ON to get only the latest version per section in one query
  const results = await db
    .selectDistinctOn([adminWorkspaceSections.id], {
      sectionId: adminWorkspaceSections.id,
      sectionTitle: adminWorkspaceSections.title,
      sectionTemplate: adminWorkspaceSections.template,
      workspaceId: adminWorkspaces.id,
      workspaceSlug: adminWorkspaces.slug,
      workspaceTitle: adminWorkspaces.title,
      content: adminSectionVersions.content,
      version: adminSectionVersions.version,
    })
    .from(adminWorkspaceSections)
    .innerJoin(adminWorkspaces, eq(adminWorkspaceSections.workspaceId, adminWorkspaces.id))
    .innerJoin(adminSectionVersions, eq(adminSectionVersions.sectionId, adminWorkspaceSections.id))
    .where(
      and(
        eq(adminWorkspaces.userId, user.id),
        or(
          ilike(adminSectionVersions.content, pattern),
          ilike(adminWorkspaceSections.title, pattern)
        )
      )
    )
    .orderBy(adminWorkspaceSections.id, desc(adminSectionVersions.version))
    .limit(limit)
    .offset(offset);

  // Extract snippet around the match
  const searchResults = results.map((r) => {
    let snippet = '';
    const content = r.content ?? '';
    const lowerContent = content.toLowerCase();
    const lowerQ = q.toLowerCase();
    const idx = lowerContent.indexOf(lowerQ);

    if (idx >= 0) {
      const start = Math.max(0, idx - config.search.snippetContextChars);
      const end = Math.min(content.length, idx + q.length + config.search.snippetContextChars);
      snippet =
        (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');
    } else {
      // Match was in title, show content preview
      snippet =
        content.slice(0, config.search.titlePreviewChars) +
        (content.length > config.search.titlePreviewChars ? '...' : '');
    }

    return {
      sectionId: r.sectionId,
      sectionTitle: r.sectionTitle,
      sectionTemplate: r.sectionTemplate,
      workspaceId: r.workspaceId,
      workspaceSlug: r.workspaceSlug,
      workspaceTitle: r.workspaceTitle,
      snippet,
    };
  });

  // Also search research findings if requested
  const includeResearch = request.nextUrl.searchParams.get('includeResearch') === 'true';
  let findingResults: Array<{
    source: 'research';
    findingId: number;
    findingType: string;
    title: string;
    snippet: string;
    workspaceId: number;
    workspaceSlug: string;
    workspaceTitle: string;
    confidenceScore: number;
  }> = [];

  if (includeResearch) {
    const findings = await db
      .select({
        findingId: adminFindings.id,
        findingType: adminFindings.findingType,
        title: adminFindings.title,
        content: adminFindings.content,
        workspaceId: adminWorkspaces.id,
        workspaceSlug: adminWorkspaces.slug,
        workspaceTitle: adminWorkspaces.title,
        confidenceScore: adminFindings.confidenceScore,
      })
      .from(adminFindings)
      .innerJoin(adminWorkspaces, eq(adminFindings.workspaceId, adminWorkspaces.id))
      .where(
        and(
          eq(adminFindings.userId, user.id),
          or(ilike(adminFindings.title, pattern), ilike(adminFindings.content, pattern))
        )
      )
      .orderBy(desc(adminFindings.createdAt))
      .limit(limit);

    findingResults = findings.map((f) => {
      const lowerContent = f.content.toLowerCase();
      const lowerQ = q.toLowerCase();
      const idx = lowerContent.indexOf(lowerQ);
      let snippet: string;
      if (idx >= 0) {
        const start = Math.max(0, idx - config.search.snippetContextChars);
        const end = Math.min(f.content.length, idx + q.length + config.search.snippetContextChars);
        snippet =
          (start > 0 ? '...' : '') +
          f.content.slice(start, end) +
          (end < f.content.length ? '...' : '');
      } else {
        snippet =
          f.content.slice(0, config.search.titlePreviewChars) +
          (f.content.length > config.search.titlePreviewChars ? '...' : '');
      }
      return {
        source: 'research' as const,
        findingId: f.findingId,
        findingType: f.findingType,
        title: f.title,
        snippet,
        workspaceId: f.workspaceId,
        workspaceSlug: f.workspaceSlug,
        workspaceTitle: f.workspaceTitle,
        confidenceScore: f.confidenceScore,
      };
    });
  }

  return NextResponse.json({
    results: searchResults,
    findings: findingResults,
    page,
    limit,
  });
}
