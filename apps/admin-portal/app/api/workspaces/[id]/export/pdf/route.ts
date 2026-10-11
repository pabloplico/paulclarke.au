import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminWorkspaceSections } from '@/lib/db/schema';
import { getLatestVersions } from '@/lib/workspaces/latest-versions';

type Params = { params: Promise<{ id: string }> };

type SectionNode = {
  title: string;
  template: string;
  content: string;
  structuredData: Record<string, unknown> | null;
  depth: number;
  children: SectionNode[];
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

  const sectionsWithContent = sections.map((section) => {
    const latest = versionMap.get(section.id);
    return {
      id: section.id,
      parentSectionId: section.parentSectionId,
      title: section.title,
      template: section.template,
      content: latest?.content ?? '',
      structuredData: latest?.structuredData ?? null,
    };
  });

  // Build tree
  const nodeMap = new Map<number, SectionNode & { id: number; parentSectionId: number | null }>();
  for (const s of sectionsWithContent) {
    nodeMap.set(s.id, { ...s, depth: 0, children: [] });
  }
  const roots: SectionNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentSectionId != null) {
      const parent = nodeMap.get(node.parentSectionId);
      if (parent) {
        node.depth = parent.depth + 1;
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  function fixDepths(nodes: SectionNode[], depth: number) {
    for (const n of nodes) {
      n.depth = depth;
      fixDepths(n.children, depth + 1);
    }
  }
  fixDepths(roots, 0);

  function renderContent(node: SectionNode): string {
    const { template, content, structuredData } = node;

    // Heading sections have no content body
    if (template === 'heading') return '';

    // Render structured data when available
    if (structuredData && template !== 'prose') {
      switch (template) {
        case 'table': {
          const cols = (structuredData.columns as string[]) ?? [];
          const rows = (structuredData.rows as Record<string, string>[]) ?? [];
          if (cols.length > 0) {
            return `<table><thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${cols.map((c) => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
          }
          break;
        }
        case 'cards': {
          const items = (structuredData.items as { title: string; body: string }[]) ?? [];
          if (items.length > 0) {
            return `<div class="cards">${items.map((item) => `<div class="card"><strong>${escapeHtml(item.title ?? '')}</strong><p>${escapeHtml(item.body ?? '')}</p></div>`).join('')}</div>`;
          }
          break;
        }
        case 'checklist': {
          const items = (structuredData.items as { text: string; checked: boolean }[]) ?? [];
          if (items.length > 0) {
            return `<ul class="checklist">${items.map((item) => `<li>${item.checked ? '\u2611' : '\u2610'} ${escapeHtml(item.text ?? '')}</li>`).join('')}</ul>`;
          }
          break;
        }
        case 'kv-pairs': {
          const pairs = (structuredData.pairs as { key: string; value: string }[]) ?? [];
          if (pairs.length > 0) {
            return `<dl>${pairs.map((p) => `<dt>${escapeHtml(p.key ?? '')}</dt><dd>${escapeHtml(p.value ?? '')}</dd>`).join('')}</dl>`;
          }
          break;
        }
      }
    }

    // Fallback: render as preformatted text
    return `<pre>${escapeHtml(content || '(No content)')}</pre>`;
  }

  // Compute section numbers
  const showNumbering = !!(workspace.metadata as Record<string, unknown> | null)?.showNumbering;
  const numberMap = new Map<SectionNode, string>();
  if (showNumbering) {
    function assignNumbers(nodes: SectionNode[], prefix: string, depth: number) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        const num = depth === 0 ? `${i + 1}.0` : `${prefix}${i + 1}`;
        numberMap.set(node, num);
        const childPrefix = depth === 0 ? `${i + 1}.` : `${num}.`;
        assignNumbers(node.children, childPrefix, depth + 1);
      }
    }
    assignNumbers(roots, '', 0);
  }

  function renderSection(node: SectionNode): string {
    const headingTag = node.depth === 0 ? 'h2' : node.depth === 1 ? 'h3' : 'h4';
    const marginClass = node.depth > 0 ? ` style="margin-left: ${node.depth * 24}px"` : '';
    const num = numberMap.get(node);
    const titleHtml = num
      ? `<span class="section-num">${escapeHtml(num)}</span> ${escapeHtml(node.title)}`
      : escapeHtml(node.title);
    return `
  <div class="section"${marginClass}>
    <${headingTag}>${titleHtml}<span class="badge">${escapeHtml(node.template)}</span></${headingTag}>
    ${renderContent(node)}
    ${node.children.map(renderSection).join('')}
  </div>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(workspace.title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      color: #1a1a1a;
      line-height: 1.6;
    }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .description { color: #666; margin-bottom: 32px; }
    .section { margin-bottom: 32px; page-break-inside: avoid; }
    .section h2 { font-size: 20px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    .section h3 { font-size: 17px; border-bottom: 1px solid #f0f0f0; padding-bottom: 6px; }
    .section h4 { font-size: 15px; color: #333; }
    .section-num { color: #999; font-weight: normal; }
    .section .badge { display: inline-block; font-size: 11px; color: #888; background: #f5f5f5; padding: 1px 8px; border-radius: 4px; margin-left: 8px; }
    .section pre { background: #f8f8f8; padding: 12px; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; font-size: 13px; }
    .section p { margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
    .card { border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
    .card strong { display: block; margin-bottom: 4px; }
    .checklist { list-style: none; padding-left: 0; }
    .checklist li { padding: 4px 0; }
    dl { margin: 12px 0; }
    dt { font-weight: 600; margin-top: 8px; }
    dd { margin-left: 16px; color: #444; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(workspace.title)}</h1>
  ${workspace.description ? `<p class="description">${escapeHtml(workspace.description)}</p>` : ''}
  ${roots.map(renderSection).join('')}
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="${workspace.slug}-export.html"`,
    },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
