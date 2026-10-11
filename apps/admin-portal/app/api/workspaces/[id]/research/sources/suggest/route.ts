import { NextResponse } from 'next/server';
import { autoAddSuggestedSources, suggestSourcesForWorkspace } from '@/lib/agents/suggest-sources';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace, user } = resolved;

  let body: { autoAdd?: boolean; freeOnly?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — use defaults
  }

  const suggestions = await suggestSourcesForWorkspace(
    { ...workspace, userId: user.id },
    { freeOnly: body.freeOnly ?? true }
  );

  let added = 0;
  if (body.autoAdd !== false) {
    added = await autoAddSuggestedSources(workspace.id, user.id, suggestions);
  }

  return NextResponse.json({
    suggestions: suggestions.map((s) => ({
      name: s.name,
      url: s.url,
      type: s.type,
      category: s.category,
      description: s.description,
      geoFocus: s.geoFocus,
      reason: s.reason,
    })),
    added,
  });
}
