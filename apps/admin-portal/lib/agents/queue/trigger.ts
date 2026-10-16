import { analysisQueue } from './analysis-queue';
import { ingestionQueue } from './ingestion-queue';
import { researchQueue } from './research-queue';

// JobQueue.add() returns nothing, so the job id is made here. Unique per
// call (Date.now()), so a trigger never dedupes against an earlier run

export async function triggerResearchTask(taskId: number, userId: number): Promise<string> {
  const jobId = `research-${taskId}-${Date.now()}`;
  await researchQueue.add('research', { taskId, userId }, { jobId });
  return jobId;
}

export async function triggerIngestionTask(
  taskId: number,
  userId: number,
  filePath: string,
  fileType: 'pdf' | 'csv',
  workspaceId: number
): Promise<string> {
  const jobId = `ingest-${taskId}-${Date.now()}`;
  await ingestionQueue.add(
    'ingest',
    { taskId, userId, filePath, fileType, workspaceId },
    { jobId }
  );
  return jobId;
}

export async function triggerAnalysisTask(taskId: number, userId: number): Promise<string> {
  const jobId = `analysis-${taskId}-${Date.now()}`;
  await analysisQueue.add('analysis', { taskId, userId }, { jobId });
  return jobId;
}
