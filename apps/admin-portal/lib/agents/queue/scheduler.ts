import { isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminAgentTasks } from '@/lib/db/schema';
import { analysisQueue } from './analysis-queue';
import { researchQueue } from './research-queue';

/**
 * Sync CRON schedules from admin_agent_tasks to BullMQ repeatable jobs.
 * Call this on app startup and whenever task schedules change.
 */
export async function syncSchedules(): Promise<void> {
  // Remove existing repeatable jobs
  for (const queue of [researchQueue, analysisQueue]) {
    const existing = await queue.getRepeatableJobs();
    for (const job of existing) {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Load active tasks with cron schedules
  const tasks = await db
    .select()
    .from(adminAgentTasks)
    .where(isNotNull(adminAgentTasks.cronSchedule));

  for (const task of tasks) {
    if (!task.cronSchedule || task.status === 'paused') continue;

    const queue = task.agentType === 'analysis' ? analysisQueue : researchQueue;
    await queue.add(
      task.agentType,
      { taskId: task.id, userId: task.userId },
      {
        repeat: { pattern: task.cronSchedule },
        jobId: `scheduled-${task.id}`,
      }
    );

    console.log(`[agent-scheduler] Registered cron for task ${task.id}: ${task.cronSchedule}`);
  }
}
