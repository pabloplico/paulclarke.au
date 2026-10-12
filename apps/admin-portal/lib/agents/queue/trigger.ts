import { getAnalysisQueue } from './analysis-queue';
import { getIngestionQueue } from './ingestion-queue';
import { getResearchQueue } from './research-queue';

export async function triggerResearchTask(taskId: number, userId: number): Promise<string> {
  const job = await getResearchQueue().add(
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
  const job = await getIngestionQueue().add(
    'ingest',
    { taskId, userId, filePath, fileType, workspaceId },
    { jobId: `ingest-${taskId}-${Date.now()}` }
  );
  return job.id!;
}

export async function triggerAnalysisTask(taskId: number, userId: number): Promise<string> {
  const job = await getAnalysisQueue().add(
    'analysis',
    { taskId, userId },
    { jobId: `analysis-${taskId}-${Date.now()}` }
  );
  return job.id!;
}
