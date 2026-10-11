import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { getPlaceDetails } from '@/lib/external-apis/google-places';

export async function GET(request: Request) {
  await requireAuthApi();
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get('placeId');

  if (!placeId) {
    return NextResponse.json({ error: 'placeId required' }, { status: 400 });
  }

  const details = await getPlaceDetails(placeId);
  if (!details) {
    return NextResponse.json({ error: 'Place not found' }, { status: 404 });
  }

  return NextResponse.json(details);
}
