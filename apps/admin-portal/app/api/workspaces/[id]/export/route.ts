import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminWorkspaceSections } from '@/lib/db/schema';
import { getLatestVersions } from '@/lib/workspaces/latest-versions';

type Params = { params: Promise<{ id: string }> };

type ExportNode = {
  number?: string;
  title: string;
  slug: string;
  template: string;
  description: string | null;
  completenessRules: unknown;
  content: string | null;
  structuredData: Record<string, unknown> | null;
  children: ExportNode[];
};

export async function GET(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const sections = await db
    .select()
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.workspaceId, workspace.id))
    .orderBy(adminWorkspaceSections.sortOrder);

  const versionMap = await getLatestVersions(sections.map((s) => s.id));

  // Build nested tree for export
  const nodeMap = new Map<number, ExportNode & { id: number; parentSectionId: number | null }>();
  for (const section of sections) {
    const latest = versionMap.get(section.id);
    nodeMap.set(section.id, {
      id: section.id,
      parentSectionId: section.parentSectionId,
      title: section.title,
      slug: section.slug,
      template: section.template,
      description: section.description,
      completenessRules: section.completenessRules,
      content: latest?.content ?? null,
      structuredData: latest?.structuredData ?? null,
      children: [],
    });
  }

  const roots: ExportNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentSectionId != null) {
      const parent = nodeMap.get(node.parentSectionId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  // Assign section numbers if enabled
  const showNumbering = !!(workspace.metadata as Record<string, unknown> | null)?.showNumbering;
  if (showNumbering) {
    function assignNumbers(nodes: (ExportNode & { id: number })[], prefix: string, depth: number) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        node.number = depth === 0 ? `${i + 1}.0` : `${prefix}${i + 1}`;
        const childPrefix = depth === 0 ? `${i + 1}.` : `${node.number}.`;
        assignNumbers(node.children as (ExportNode & { id: number })[], childPrefix, depth + 1);
      }
    }
    assignNumbers(roots as (ExportNode & { id: number })[], '', 0);
  }

  // Strip internal IDs from export
  function cleanNode(
    node: ExportNode & { id?: number; parentSectionId?: number | null }
  ): ExportNode {
    const { id: _id, parentSectionId: _pid, ...rest } = node;
    return { ...rest, children: rest.children.map(cleanNode) };
  }

  const exported = {
    exportedAt: new Date().toISOString(),
    workspaces: [
      {
        title: workspace.title,
        slug: workspace.slug,
        description: workspace.description,
        icon: workspace.icon,
        metadata: workspace.metadata,
        sections: roots.map(cleanNode),
      },
    ],
  };

  return new NextResponse(JSON.stringify(exported, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${workspace.slug}.json"`,
    },
  });
}
