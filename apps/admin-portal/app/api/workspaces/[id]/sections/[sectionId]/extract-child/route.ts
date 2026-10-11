import { and, desc, eq, max } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSectionParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminSectionVersions, adminWorkspaceSections } from '@/lib/db/schema';
import { validateDepth } from '@/lib/workspaces/section-tree';

type Params = { params: Promise<{ id: string; sectionId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { workspace, section } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const { selectedText, childTitle } = parsed.data as { selectedText: string; childTitle?: string };

  if (!(selectedText as string)?.trim()) {
    return NextResponse.json({ error: 'Selected text is required' }, { status: 400 });
  }

  // Validate depth — new child goes under this section
  const allSections = await db
    .select({
      id: adminWorkspaceSections.id,
      parentSectionId: adminWorkspaceSections.parentSectionId,
    })
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.workspaceId, workspace.id));

  const depthCheck = validateDepth(section.id, allSections);
  if (!depthCheck.valid) {
    return NextResponse.json({ error: depthCheck.error }, { status: 400 });
  }

  // Get latest content
  const [latest] = await db
    .select({ content: adminSectionVersions.content, version: adminSectionVersions.version })
    .from(adminSectionVersions)
    .where(eq(adminSectionVersions.sectionId, section.id))
    .orderBy(desc(adminSectionVersions.version))
    .limit(1);

  const content = latest?.content ?? '';

  // Try to remove selected text from parent content.
  // The selectedText comes from window.getSelection() which returns rendered plain text,
  // not the original markdown — so exact match may fail. If it does, still create the
  // child but leave the parent content unchanged.
  let remaining: string | null = null;
  let extractedContent = (selectedText as string).trim();

  // 1. Try exact match
  const idx = content.indexOf(selectedText as string);
  if (idx !== -1) {
    remaining = (
      content.slice(0, idx) + content.slice(idx + (selectedText as string).length)
    ).replace(/\n{3,}/g, '\n\n');
  } else {
    // 2. Try line-based matching: strip markdown and match contiguous lines
    const stripMd = (s: string) =>
      s
        .replace(/[*_~`#>[\]()!|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const contentLines = content.split('\n');
    const selectedLines = (selectedText as string)
      .split('\n')
      .map((l: string) => stripMd(l))
      .filter(Boolean);

    if (selectedLines.length > 0) {
      let startLine = -1;
      let endLine = -1;
      for (let i = 0; i <= contentLines.length - selectedLines.length; i++) {
        const contentNorm = stripMd(contentLines[i] ?? '');
        if (
          contentNorm &&
          (contentNorm.includes(selectedLines[0]!) || selectedLines[0]?.includes(contentNorm))
        ) {
          let match = true;
          for (let j = 1; j < selectedLines.length; j++) {
            const cn = stripMd(contentLines[i + j] ?? '');
            const sl = selectedLines[j];
            if (cn && sl && !cn.includes(sl) && !sl.includes(cn)) {
              match = false;
              break;
            }
          }
          if (match) {
            startLine = i;
            endLine = i + selectedLines.length;
            break;
          }
        }
      }

      if (startLine !== -1) {
        const before = contentLines.slice(0, startLine);
        const after = contentLines.slice(endLine);
        remaining = [...before, ...after].join('\n').replace(/\n{3,}/g, '\n\n');
        extractedContent = contentLines.slice(startLine, endLine).join('\n').trim();
      }
    }
  }

  // Get max sort order among existing children
  const existing = await db
    .select({ maxSort: max(adminWorkspaceSections.sortOrder) })
    .from(adminWorkspaceSections)
    .where(
      and(
        eq(adminWorkspaceSections.workspaceId, workspace.id),
        eq(adminWorkspaceSections.parentSectionId, section.id)
      )
    );
  const nextSort = (existing[0]?.maxSort ?? -1) + 1;

  const title = (childTitle as string)?.trim() || 'Extracted Section';
  const slug = (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') +
    '-' +
    nextSort
  ).slice(0, 100);

  const result = await db.transaction(async (tx) => {
    // Update parent section content if we successfully matched
    let updatedVersion = latest;
    if (remaining !== null) {
      const nextVersion = (latest?.version ?? 0) + 1;
      const [newVersion] = await tx
        .insert(adminSectionVersions)
        .values({
          sectionId: section.id,
          version: nextVersion,
          content: remaining.trim(),
          changeDescription: 'Extracted text to child section',
          changeSource: 'manual',
        })
        .returning();
      updatedVersion = newVersion;

      await tx
        .update(adminWorkspaceSections)
        .set({ updatedAt: new Date() })
        .where(eq(adminWorkspaceSections.id, section.id));
    }

    // Create child section
    const [childSection] = await tx
      .insert(adminWorkspaceSections)
      .values({
        workspaceId: workspace.id,
        parentSectionId: section.id,
        slug,
        title,
        description: `Extracted from: ${section.title}`,
        template: 'prose',
        sortOrder: nextSort,
      })
      .returning();

    if (!childSection) {
      throw new Error('Failed to create child section');
    }

    await tx.insert(adminSectionVersions).values({
      sectionId: childSection.id,
      version: 1,
      content: extractedContent,
      changeDescription: 'Extracted from parent section',
      changeSource: 'manual',
    });

    return {
      original: { ...section, latestVersion: updatedVersion },
      childSection: {
        ...childSection,
        latestVersion: { version: 1, content: extractedContent },
      },
    };
  });

  return NextResponse.json(result, { status: 201 });
}
