import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { createBackup, pruneOldBackups } from './backup';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const queue = new Queue('db-backup', { connection });

// Schedule backups twice daily at 8 AM and 8 PM
queue.upsertJobScheduler(
  'db-backup-schedule',
  {
    pattern: '0 8,20 * * *',
  },
  {
    name: 'scheduled-backup',
  }
);

const worker = new Worker(
  'db-backup',
  async (job) => {
    console.log(`[backup-worker] Starting database backup (job ${job.id})...`);

    const backup = await createBackup();
    console.log(
      `[backup-worker] Backup complete: ${backup.filename} (${(backup.size / 1024 / 1024).toFixed(1)} MB)`
    );

    const pruned = await pruneOldBackups();
    if (pruned > 0) {
      console.log(`[backup-worker] Pruned ${pruned} old backup(s)`);
    }

    return backup;
  },
  {
    connection,
    concurrency: 1,
  }
);

worker.on('completed', (job) => {
  console.log(`[backup-worker] Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`[backup-worker] Job ${job?.id} failed:`, err.message);
});

export { queue, worker };
