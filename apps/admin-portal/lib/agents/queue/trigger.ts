import { analysisQueue } from './analysis-queue';
import { ingestionQueue } from './ingestion-queue';
import { researchQueue } from './research-queue';

export async function triggerResearchTask(taskId: number, userId: number): Promise<string> {
  const job = await researchQueue.add(
    'research',
    { taskId, userId },
    { jobId: `research-${taskId}-${Date.now()}` }
  );
  return job.id!;
}

export async function triggerIngestionTask(
  taskId: number,
  userId: number,
  filePath: string,
  fileType: 'pdf' | 'csv',
  workspaceId: number
): Promise<string> {
  const job = await ingestionQueue.add(
    'ingest',
    { taskId, userId, filePath, fileType, workspaceId },
    { jobId: `ingest-${taskId}-${Date.now()}` }
  );
  return job.id!;
}

export async function triggerAnalysisTask(taskId: number, userId: number): Promise<string> {
  const job = await analysisQueue.add(
    'analysis',
    { taskId, userId },
    { jobId: `analysis-${taskId}-${Date.now()}` }
  );
  return job.id!;
}
