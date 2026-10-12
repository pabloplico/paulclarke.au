import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { triggerIngestionTask } from '@/lib/agents/queue/trigger';
import { requireAiAllowance } from '@/lib/ai/allowance';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminAgentTasks } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  await requireAiAllowance(resolved.user);
  const { workspace, user } = resolved;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  // File size limit (50MB)
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 413 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'pdf' && ext !== 'csv') {
    return NextResponse.json({ error: 'Only PDF and CSV files are supported' }, { status: 400 });
  }

  // Sanitize filename
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.+/g, '.');
  const uploadsDir = join(process.cwd(), 'uploads', 'research');
  await mkdir(uploadsDir, { recursive: true });
  const filename = `${Date.now()}-${safeName}`;
  const filePath = join(uploadsDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  // Find or create an ingestion task for this workspace
  let [task] = await db
    .select()
    .from(adminAgentTasks)
    .where(
      and(
        eq(adminAgentTasks.workspaceId, workspace.id),
        eq(adminAgentTasks.userId, user.id),
        eq(adminAgentTasks.agentType, 'ingestion')
      )
    );

  if (!task) {
    [task] = await db
      .insert(adminAgentTasks)
      .values({
        userId: user.id,
        workspaceId: workspace.id,
        agentType: 'ingestion',
        name: 'File Ingestion',
      })
      .returning();
  }

  if (!task) {
    return NextResponse.json({ error: 'Failed to create ingestion task' }, { status: 500 });
  }

  const jobId = await triggerIngestionTask(task.id, user.id, filePath, ext, workspace.id);

  return NextResponse.json(
    {
      message: 'File uploaded and ingestion queued',
      filename,
      taskId: task.id,
      jobId,
    },
    { status: 201 }
  );
}
