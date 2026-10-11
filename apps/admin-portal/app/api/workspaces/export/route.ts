import { and, desc, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminSectionVersions, adminWorkspaceSections, adminWorkspaces } from '@/lib/db/schema';

export async function GET() {
  const user = await requireAuthApi();

  const workspaces = await db
    .select()
    .from(adminWorkspaces)
    .where(and(isNull(adminWorkspaces.archivedAt), eq(adminWorkspaces.userId, user.id)))
    .orderBy(adminWorkspaces.sortOrder);

  const exported = await Promise.all(
    workspaces.map(async (ws) => {
      const sections = await db
        .select()
        .from(adminWorkspaceSections)
        .where(eq(adminWorkspaceSections.workspaceId, ws.id))
        .orderBy(adminWorkspaceSections.sortOrder);

      const sectionsWithContent = await Promise.all(
        sections.map(async (section) => {
          const [latestVersion] = await db
            .select()
            .from(adminSectionVersions)
            .where(eq(adminSectionVersions.sectionId, section.id))
            .orderBy(desc(adminSectionVersions.version))
            .limit(1);

          return {
            title: section.title,
            slug: section.slug,
            template: section.template,
            description: section.description,
            completenessRules: section.completenessRules,
            content: latestVersion?.content ?? null,
            structuredData: latestVersion?.structuredData ?? null,
          };
        })
      );

      return {
        title: ws.title,
        slug: ws.slug,
        description: ws.description,
        icon: ws.icon,
        metadata: ws.metadata,
        sections: sectionsWithContent,
      };
    })
  );

  const date = new Date().toISOString().slice(0, 10);
  const payload = { exportedAt: new Date().toISOString(), workspaces: exported };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="workspaces-backup-${date}.json"`,
    },
  });
}
