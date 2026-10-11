import { desc, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSectionParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminSectionVersions, adminWorkspaceSections } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; sectionId: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { section } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    content?: string;
    structuredData?: Record<string, unknown>;
    changeDescription?: string;
    changeSource?: string;
  };
  const { content, structuredData, changeDescription, changeSource } = body;

  // Get current latest version number
  const [latest] = await db
    .select({ version: adminSectionVersions.version })
    .from(adminSectionVersions)
    .where(eq(adminSectionVersions.sectionId, section.id))
    .orderBy(desc(adminSectionVersions.version))
    .limit(1);

  const nextVersion = (latest?.version ?? 0) + 1;

  const [version] = await db
    .insert(adminSectionVersions)
    .values({
      sectionId: section.id,
      version: nextVersion,
      content: content ?? null,
      structuredData: structuredData ?? null,
      changeDescription: changeDescription || `Version ${nextVersion}`,
      changeSource: changeSource || 'manual',
    })
    .returning();

  // Update section's updatedAt
  await db
    .update(adminWorkspaceSections)
    .set({ updatedAt: new Date() })
    .where(eq(adminWorkspaceSections.id, section.id));

  return NextResponse.json(version, { status: 201 });
}
