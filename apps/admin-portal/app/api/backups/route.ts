import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/server';
import { createBackup, listBackups } from '@/lib/db/backup';

export async function GET() {
  try {
    await requireAdminApi();
    const backups = await listBackups();
    return NextResponse.json(backups);
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list backups' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    await requireAdminApi();
    const backup = await createBackup();
    return NextResponse.json(backup, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Backup failed' },
      { status: 500 }
    );
  }
}
