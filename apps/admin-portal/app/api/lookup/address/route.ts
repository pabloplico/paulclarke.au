import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { searchAddresses } from '@/lib/external-apis/google-places';

export async function GET(request: Request) {
  await requireAuthApi();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q || q.length < 3) {
    return NextResponse.json({ predictions: [] });
  }

  const predictions = await searchAddresses(q);
  return NextResponse.json({ predictions });
}
