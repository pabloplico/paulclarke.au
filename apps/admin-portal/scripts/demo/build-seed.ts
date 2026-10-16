/**
 * Builds lib/demo-seed/generated.json: the AI-made part of the demo seed.
 *
 * It runs the real app on a throwaway in-memory database: seeds the
 * hand-written Harbourside Bakery content, uploads the pre-routed document
 * through the inbox route (parse, chunk, embed, analyse, route), and runs a
 * gap analysis on the workspaces in GAP_REPORT_WORKSPACES. Then it writes the
 * results with stable keys instead of database ids, so seeding a visitor
 * needs no AI calls at all.
 *
 *   OPENAI_API_KEY=… AI_PROVIDER=openai AI_MODEL=gpt-4.1-nano pnpm demo:build-seed
 *
 * PAID: it spends real money on whatever key is set (a fraction of a cent
 * with gpt-4.1-nano). Ask before running it. Re-run it after changing
 * content.ts or the pre-routed document, and commit the result.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Before any app module loads: a private in-memory app with sign-in off
process.env.DB_DRIVER = 'pglite';
process.env.AUTH_ENABLED = 'false';
process.env.NEXT_RUNTIME = 'nodejs';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;
delete process.env.DEMO_MODE;
const uploadsDir = mkdtempSync(join(tmpdir(), 'demo-seed-uploads-'));
process.env.UPLOADS_DIR = uploadsDir;

const seedDir = join(process.cwd(), 'lib/demo-seed');

async function main() {
  const { aiConfigProblems } = await import('@/lib/ai/config-check');
  const problems = aiConfigProblems();
  if (problems.length) throw new Error(problems.join(' '));

  const { config } = await import('@/lib/config');
  const { register } = await import('@/instrumentation');
  await register();

  const { db } = await import('@/lib/db');
  const schema = await import('@/lib/db/schema');
  const { eq, desc, inArray } = await import('drizzle-orm');
  const { seedDefaultWorkspace } = await import('@/lib/onboarding/seed-default-workspace');
  const { seedDemoContent } = await import('@/lib/demo-seed/seed-content');
  const { GAP_REPORT_WORKSPACES, PREROUTED_DOCUMENT } = await import('@/lib/demo-seed/content');

  // The first user is the signed-in user while AUTH_ENABLED=false
  const [user] = await db
    .insert(schema.adminUsers)
    .values({ email: 'seed@demo.invalid', passwordHash: 'x', name: 'Seed' })
    .returning();
  if (!user) throw new Error('No user');
  await seedDefaultWorkspace(user.id);
  await seedDemoContent(db, user.id);

  // Every section, keyed the way the fixtures name them
  const workspaces = await db
    .select()
    .from(schema.adminWorkspaces)
    .where(eq(schema.adminWorkspaces.userId, user.id));
  const keyOfWorkspace = new Map(
    workspaces.map((w) => [w.id, w.slug.replace(new RegExp(`-u${user.id}$`), '')])
  );
  const sections = await db
    .select()
    .from(schema.adminWorkspaceSections)
    .where(
      inArray(
        schema.adminWorkspaceSections.workspaceId,
        workspaces.map((w) => w.id)
      )
    );
  const keyOfSection = new Map(
    sections.map((s) => [s.id, `${keyOfWorkspace.get(s.workspaceId)}/${s.slug}`])
  );

  // Upload the document through the real inbox route and let both queues finish
  console.log(`Processing ${PREROUTED_DOCUMENT.filename}…`);
  const text = readFileSync(join(seedDir, 'documents', PREROUTED_DOCUMENT.filename));
  const form = new FormData();
  form.set('file', new File([text], PREROUTED_DOCUMENT.filename, { type: 'text/markdown' }));
  const { POST: upload } = await import('@/app/api/inbox/route');
  const response = await upload(
    new Request('http://seed/api/inbox', { method: 'POST', body: form })
  );
  if (response.status !== 202) throw new Error(`Upload failed: ${await response.text()}`);
  const { id: inboxItemId } = (await response.json()) as { id: number };

  const { documentQueue } = await import('@/lib/document-processing/queue');
  const { routingQueue } = await import('@/lib/workspace-routing/queue');
  for (let i = 0; i < 2; i++) {
    await documentQueue.drained();
    await routingQueue.drained();
  }

  const [item] = await db
    .select()
    .from(schema.adminInboxItems)
    .where(eq(schema.adminInboxItems.id, inboxItemId));
  if (item?.status !== 'routed' || !item.documentId) {
    throw new Error(`Routing didn't finish: ${item?.status} ${item?.processingError ?? ''}`);
  }
  const [doc] = await db
    .select()
    .from(schema.adminDocuments)
    .where(eq(schema.adminDocuments.id, item.documentId));
  if (doc?.status !== 'ready') throw new Error(`Document not ready: ${doc?.processingError}`);
  const chunks = await db
    .select()
    .from(schema.adminDocumentChunks)
    .where(eq(schema.adminDocumentChunks.documentId, doc.id))
    .orderBy(schema.adminDocumentChunks.chunkIndex);
  if (chunks.some((c) => !c.embedding)) throw new Error('A chunk has no embedding');

  // Gap analysis through the real route
  const { POST: analyse } = await import('@/app/api/workspaces/[id]/gap-analysis/route');
  const gapReports = [];
  for (const key of GAP_REPORT_WORKSPACES) {
    const workspace = workspaces.find((w) => keyOfWorkspace.get(w.id) === key);
    if (!workspace) throw new Error(`No workspace ${key}`);
    console.log(`Gap analysis: ${workspace.title}…`);
    const res = await analyse(new Request('http://seed') as never, {
      params: Promise.resolve({ id: String(workspace.id) }),
    });
    if (!res.ok) throw new Error(`Gap analysis failed: ${await res.text()}`);
    const [report] = await db
      .select()
      .from(schema.adminGapReports)
      .where(eq(schema.adminGapReports.workspaceId, workspace.id))
      .orderBy(desc(schema.adminGapReports.createdAt))
      .limit(1);
    if (!report) throw new Error(`No gap report for ${key}`);
    gapReports.push({
      workspaceKey: key,
      // Section ids become keys; hashes are recomputed when a visitor is seeded
      findings: report.findings.map(({ sectionId, contentHashAtAnalysis: _, ...f }) => ({
        ...f,
        sectionKey: keyOfSection.get(sectionId) ?? null,
      })),
    });
  }

  const generated = {
    builtWith: { model: config.ai.model, embeddingModel: config.ai.embedding.model },
    document: {
      filename: doc.filename,
      title: doc.title,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      rawText: doc.rawText,
      cleanedText: doc.cleanedText,
      pageCount: doc.pageCount,
      aiSummary: doc.aiSummary,
      aiTitle: doc.aiTitle,
      aiTags: doc.aiTags,
      aiLanguage: doc.aiLanguage,
      aiDocumentType: doc.aiDocumentType,
      metadata: doc.metadata,
    },
    chunks: chunks.map((c) => ({
      chunkIndex: c.chunkIndex,
      content: c.content,
      tokenCount: c.tokenCount,
      metadata: c.metadata,
      // 7 significant digits: a third of the file size, same search results
      embedding: (c.embedding ?? []).map((x) => Number(x.toPrecision(7))),
    })),
    inboxItem: {
      title: item.title,
      qualityFlags: item.qualityFlags,
      routingResults: (item.routingResults ?? []).map(
        ({ workspaceId, sectionId, ...suggestion }) => ({
          ...suggestion,
          workspaceKey: keyOfWorkspace.get(workspaceId) ?? null,
          sectionKey: keyOfSection.get(sectionId) ?? null,
        })
      ),
    },
    gapReports,
  };

  const out = join(seedDir, 'generated.json');
  writeFileSync(out, `${JSON.stringify(generated, null, 2)}\n`);
  const { spendLedger } = await import('@/lib/ai/usage-logger');
  console.log(`Wrote ${out}`);
  console.log(
    `${chunks.length} chunks, ${generated.inboxItem.routingResults.length} routing suggestions, ` +
      `${gapReports.map((r) => `${r.workspaceKey}: ${r.findings.length} findings`).join(', ')}`
  );
  console.log(`AI cost: US$${spendLedger().spentToday(user.id).total.toFixed(6)}`);
}

main()
  .catch((error) => {
    console.error(`Demo seed build failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    rmSync(uploadsDir, { recursive: true, force: true });
    const { getPglite } = await import('@/lib/db/pglite');
    await getPglite().close();
    // In-process queue timers would otherwise keep the process alive
    process.exit();
  });
