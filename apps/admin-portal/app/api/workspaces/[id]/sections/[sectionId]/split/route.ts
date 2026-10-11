import { desc, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSectionParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminSectionVersions, adminWorkspaceSections } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; sectionId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { workspace, section } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const { splitAt, secondTitle } = parsed.data as { splitAt: number; secondTitle?: string };

  if (typeof splitAt !== 'number' || splitAt < 1) {
    return NextResponse.json({ error: 'splitAt must be a positive line number' }, { status: 400 });
  }

  // Get latest content
  const [latest] = await db
    .select({ content: adminSectionVersions.content, version: adminSectionVersions.version })
    .from(adminSectionVersions)
    .where(eq(adminSectionVersions.sectionId, section.id))
    .orderBy(desc(adminSectionVersions.version))
    .limit(1);

  const content = latest?.content ?? '';
  const lines = content.split('\n');

  if (splitAt >= lines.length) {
    return NextResponse.json({ error: 'splitAt exceeds content length' }, { status: 400 });
  }

  const firstHalf = lines.slice(0, splitAt).join('\n');
  const secondHalf = lines.slice(splitAt).join('\n');

  const newTitle = (secondTitle as string)?.trim() || `${section.title} (continued)`;
  const slug = newTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  const result = await db.transaction(async (tx) => {
    // Update original section with first half
    const nextVersion = (latest?.version ?? 0) + 1;
    const [updatedVersion] = await tx
      .insert(adminSectionVersions)
      .values({
        sectionId: section.id,
        version: nextVersion,
        content: firstHalf,
        changeDescription: 'Split: kept first half',
        changeSource: 'manual',
      })
      .returning();

    await tx
      .update(adminWorkspaceSections)
      .set({ updatedAt: new Date() })
      .where(eq(adminWorkspaceSections.id, section.id));

    // Create new section with second half (inherits parent from original)
    const [newSection] = await tx
      .insert(adminWorkspaceSections)
      .values({
        workspaceId: workspace.id,
        parentSectionId: section.parentSectionId,
        slug,
        title: newTitle,
        description: `Split from: ${section.title}`,
        template: section.template,
        sortOrder: section.sortOrder + 1,
      })
      .returning();

    if (!newSection) {
      throw new Error('Failed to create split section');
    }

    await tx.insert(adminSectionVersions).values({
      sectionId: newSection.id,
      version: 1,
      content: secondHalf,
      changeDescription: 'Split: second half',
      changeSource: 'manual',
    });

    return {
      original: { ...section, latestVersion: updatedVersion },
      newSection: { ...newSection, latestVersion: { version: 1, content: secondHalf } },
    };
  });

  return NextResponse.json(result, { status: 201 });
}
