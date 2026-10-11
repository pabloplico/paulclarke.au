import { requireAdmin } from '@/lib/auth/server';
import { listBackups } from '@/lib/db/backup';
import { BackupsView } from './backups-view';

export const dynamic = 'force-dynamic';

export default async function BackupsPage() {
  await requireAdmin();
  const backups = await listBackups();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Database Backups</h2>
      <BackupsView initialBackups={backups} />
    </div>
  );
}
