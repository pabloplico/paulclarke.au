import { and, eq } from 'drizzle-orm';
import IORedis from 'ioredis';
import { runLogChannel } from '@/lib/agents/queue/log-channel';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminAgentRuns, adminAgentTasks } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; runId: string }> };

const SSE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds

export async function GET(_request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const { runId } = await params;
  const runIdNum = parseInt(runId, 10);
  if (Number.isNaN(runIdNum)) {
    return new Response('Invalid run ID', { status: 400 });
  }

  // Join with tasks to verify workspace ownership
  const [result] = await db
    .select({ id: adminAgentRuns.id })
    .from(adminAgentRuns)
    .innerJoin(adminAgentTasks, eq(adminAgentTasks.id, adminAgentRuns.taskId))
    .where(and(eq(adminAgentRuns.id, runIdNum), eq(adminAgentTasks.workspaceId, workspace.id)));

  if (!result) {
    return new Response('Run not found', { status: 404 });
  }

  // Dedicated subscriber connection (Redis pub/sub requires its own connection)
  const subscriber = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const encoder = new TextEncoder();
  const channel = runLogChannel(runIdNum);
  let timeout: ReturnType<typeof setTimeout>;
  let heartbeat: ReturnType<typeof setInterval>;

  function cleanup() {
    clearTimeout(timeout);
    clearInterval(heartbeat);
    subscriber.unsubscribe(channel);
    subscriber.disconnect();
  }

  const stream = new ReadableStream({
    start(controller) {
      timeout = setTimeout(() => {
        cleanup();
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, status: 'timeout' })}\n\n`)
          );
          controller.close();
        } catch {
          /* already closed */
        }
      }, SSE_TIMEOUT_MS);

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_INTERVAL_MS);

      subscriber.subscribe(channel);
      subscriber.on('message', (_ch: string, message: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
          const parsed = JSON.parse(message);
          if (parsed.done) {
            cleanup();
            controller.close();
          }
        } catch {
          /* not JSON or already closed, ignore */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
