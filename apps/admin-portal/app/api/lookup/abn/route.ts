import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { lookupAbn } from '@/lib/external-apis/abn-lookup';
import { isValidAbn } from '@/lib/external-apis/abn-validation';
import { searchCompany } from '@/lib/external-apis/brave-search';

export async function GET(request: Request) {
  await requireAuthApi();
  const { searchParams } = new URL(request.url);
  const abn = searchParams.get('abn')?.replace(/\s/g, '');

  if (!abn || !isValidAbn(abn)) {
    return NextResponse.json({ error: 'Invalid ABN' }, { status: 400 });
  }

  const result = await lookupAbn(abn);
  if (!result) {
    return NextResponse.json({ error: 'ABN not found' }, { status: 404 });
  }

  // Enrich with Brave Search for website/description
  if (result.companyName) {
    const enrichment = await searchCompany(result.companyName);
    if (enrichment.website) result.website = enrichment.website;
    if (enrichment.description) result.description = enrichment.description;
  }

  return NextResponse.json(result);
}
