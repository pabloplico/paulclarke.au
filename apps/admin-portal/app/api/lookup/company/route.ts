import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { searchAbnByName } from '@/lib/external-apis/abn-lookup';
import { searchPlaces } from '@/lib/external-apis/google-places';
import type { CompanySuggestion } from '@/lib/external-apis/types';

export async function GET(request: Request) {
  await requireAuthApi();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const [abnResults, placesResults] = await Promise.allSettled([
    searchAbnByName(q),
    searchPlaces(q),
  ]);

  const suggestions: CompanySuggestion[] = [];

  if (abnResults.status === 'fulfilled') {
    suggestions.push(...abnResults.value);
  }
  if (placesResults.status === 'fulfilled') {
    // Deduplicate: skip places results that closely match an ABN name
    const abnNames = new Set(suggestions.map((s) => s.companyName.toLowerCase()));
    for (const place of placesResults.value) {
      if (!abnNames.has(place.companyName.toLowerCase())) {
        suggestions.push(place);
      }
    }
  }

  return NextResponse.json({ suggestions: suggestions.slice(0, 8) });
}
