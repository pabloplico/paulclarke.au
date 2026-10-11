import type { CompanySuggestion } from './types';

const ABN_GUID = process.env.ABN_LOOKUP_GUID;
const BASE_URL = 'https://abr.business.gov.au/json';

type AbnNameResult = {
  Abn: string;
  AbnStatus: string;
  Name: string;
  NameType: string;
  State: string;
  Postcode: string;
  Score: number;
};

type AbnDetailResult = {
  Abn: string;
  AbnStatus: string;
  AbnStatusEffectiveFrom: string;
  EntityName: string;
  EntityTypeName: string;
  Gst: string;
  AddressState: string;
  AddressPostcode: string;
  Message: string;
};

function stripJsonp(text: string): string {
  // ABR API returns JSONP like: callback({...})
  const match = text.match(/^[^(]*\((.+)\)\s*$/s);
  return match?.[1] ?? text;
}

export async function searchAbnByName(name: string): Promise<CompanySuggestion[]> {
  if (!ABN_GUID) return [];

  const url = `${BASE_URL}/MatchingNames.aspx?name=${encodeURIComponent(name)}&maxResults=6&guid=${ABN_GUID}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const text = await res.text();
  let data: { Names?: AbnNameResult[] };
  try {
    data = JSON.parse(stripJsonp(text));
  } catch {
    return [];
  }

  if (!data.Names || !Array.isArray(data.Names)) return [];

  return data.Names.filter((n: AbnNameResult) => n.AbnStatus === 'Active').map(
    (n: AbnNameResult): CompanySuggestion => ({
      source: 'abn',
      companyName: n.Name,
      abn: n.Abn,
      state: n.State,
      postcode: n.Postcode,
      address: [n.State, n.Postcode].filter(Boolean).join(' '),
    })
  );
}

export async function lookupAbn(abn: string): Promise<CompanySuggestion | null> {
  if (!ABN_GUID) return null;

  const cleanAbn = abn.replace(/\s/g, '');
  const url = `${BASE_URL}/AbnDetails.aspx?abn=${cleanAbn}&guid=${ABN_GUID}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const text = await res.text();
  let data: AbnDetailResult;
  try {
    data = JSON.parse(stripJsonp(text));
  } catch {
    return null;
  }

  if (data.Message) return null;

  return {
    source: 'abn',
    companyName: data.EntityName,
    abn: data.Abn,
    entityType: data.EntityTypeName,
    state: data.AddressState,
    postcode: data.AddressPostcode,
    address: [data.AddressState, data.AddressPostcode].filter(Boolean).join(' '),
    gstRegistered: data.Gst !== '',
  };
}
