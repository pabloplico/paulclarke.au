import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/server';
import { deleteBackup, getBackupPath } from '@/lib/db/backup';

type Params = { params: Promise<{ filename: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { filename } = await params;
  const filePath = getBackupPath(filename);

  if (!filePath) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  try {
    const info = await stat(filePath);
    const stream = createReadStream(filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(info.size),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { filename } = await params;

  try {
    await deleteBackup(filename);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed' },
      { status: 400 }
    );
  }
}
