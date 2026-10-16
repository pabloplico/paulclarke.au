import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every API route that can start AI work must call requireAiAllowance (the
 * per-user rate limit and daily budget check). "Can start AI work" is worked
 * out from the import graph, not a hand-kept list, so a new AI route that
 * forgets the check fails here:
 *
 * - the route, or anything it imports from the app, calls the AI SDK
 *   (generateText, generateObject, streamText, embed...) or runs a Mastra
 *   agent (agent.generate(), agent.stream()), or
 * - it imports a module that queues AI jobs (document processing, routing,
 *   research agents), whose AI calls happen later in a worker.
 */
const root = join(__dirname, '..', '..');
const AI_CALL = /\b(generateText|generateObject|streamText|streamObject|embedMany|embed)\s*\(/;
// A Mastra agent's generate() and stream() call the model: researchAgent.generate(...)
const AGENT_CALL = /\b\w*[aA]gent\s*\.\s*(generate|stream)\s*\(/;
const ENQUEUES_AI = [
  'lib/document-processing/queue.ts',
  'lib/workspace-routing/queue.ts',
  'lib/agents/queue/trigger.ts',
].map((path) => join(root, path));

/** Routes that reach AI code through their imports but never start AI work. */
const EXEMPT: Record<string, string> = {
  'app/api/workspaces/[id]/research/agent-runs/[runId]/cancel/route.ts':
    'cancels a research run: it only writes the run status and makes no AI call',
};

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(root, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const memo = new Map<string, boolean>();
function startsAiWork(file: string, visiting = new Set<string>()): boolean {
  const known = memo.get(file);
  if (known !== undefined) return known;
  if (visiting.has(file)) return false;
  visiting.add(file);
  const source = readFileSync(file, 'utf8');
  let result =
    ENQUEUES_AI.includes(file) ||
    (AI_CALL.test(source) && source.includes("from 'ai'")) ||
    AGENT_CALL.test(source);
  if (!result) {
    for (const match of source.matchAll(/(?:from|import\()\s*'([^']+)'/g)) {
      const target = resolveImport(file, match[1] ?? '');
      if (target && !target.includes('.test.') && startsAiWork(target, visiting)) {
        result = true;
        break;
      }
    }
  }
  visiting.delete(file);
  memo.set(file, result);
  return result;
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === 'route.ts' ? [path] : [];
  });
}

describe('AI allowance coverage', () => {
  const aiRoutes = routeFiles(join(root, 'app', 'api')).filter((file) => startsAiWork(file));

  it('finds the AI routes (sanity check on the import graph)', () => {
    const names = aiRoutes.map((file) => relative(join(root, 'app', 'api'), file));
    expect(names).toContain('inbox/route.ts');
    expect(names).toContain('workspaces/[id]/sections/[sectionId]/ai-edit/route.ts');
    expect(names).toContain('find-source/route.ts');
    expect(aiRoutes.length).toBeGreaterThan(20);
  });

  it('counts code that runs a Mastra agent as AI work, not only code that queues it', () => {
    for (const path of [
      'lib/agents/queue/research-queue.ts',
      'lib/agents/queue/ingestion-queue.ts',
      'lib/agents/queue/analysis-queue.ts',
    ]) {
      expect(startsAiWork(join(root, path)), path).toBe(true);
    }
  });

  it('has every AI route call requireAiAllowance', () => {
    const missing = aiRoutes
      .map((file) => relative(root, file))
      .filter((file) => !EXEMPT[file])
      .filter((file) => !readFileSync(join(root, file), 'utf8').includes('requireAiAllowance('));
    expect(missing).toEqual([]);
  });
});
