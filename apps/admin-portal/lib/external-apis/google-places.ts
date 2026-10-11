import type { AddressPrediction, CompanySuggestion } from './types';

const API_KEY = process.env.GOOGLE_API_KEY;
const PLACES_BASE = 'https://places.googleapis.com/v1';

type AutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId: string;
      text: { text: string };
      structuredFormat?: {
        mainText: { text: string };
        secondaryText?: { text: string };
      };
    };
  }[];
};

type PlaceDetailsResponse = {
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  types?: string[];
};

export async function searchPlaces(query: string): Promise<CompanySuggestion[]> {
  if (!API_KEY) return [];

  const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ['au'],
      includedPrimaryTypes: ['establishment'],
    }),
  });

  if (!res.ok) return [];
  const data: AutocompleteResponse = await res.json();

  return (
    data.suggestions
      ?.filter((s) => s.placePrediction)
      .map((s): CompanySuggestion => {
        const p = s.placePrediction!;
        return {
          source: 'places',
          companyName: p.structuredFormat?.mainText?.text || p.text.text,
          address: p.structuredFormat?.secondaryText?.text,
          placeId: p.placeId,
        };
      }) || []
  );
}

export async function searchAddresses(query: string): Promise<AddressPrediction[]> {
  if (!API_KEY) return [];

  const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ['au'],
      includedPrimaryTypes: ['address'],
    }),
  });

  if (!res.ok) return [];
  const data: AutocompleteResponse = await res.json();

  return (
    data.suggestions
      ?.filter((s) => s.placePrediction)
      .map(
        (s): AddressPrediction => ({
          placeId: s.placePrediction?.placeId ?? '',
          description: s.placePrediction?.text.text ?? '',
        })
      ) || []
  );
}

export async function getPlaceDetails(
  placeId: string
): Promise<{ address?: string; phone?: string; website?: string; name?: string } | null> {
  if (!API_KEY) return null;

  const fieldMask = 'displayName,formattedAddress,nationalPhoneNumber,websiteUri';
  const res = await fetch(`${PLACES_BASE}/places/${placeId}?languageCode=en`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
  });

  if (!res.ok) return null;
  const data: PlaceDetailsResponse = await res.json();

  return {
    name: data.displayName?.text,
    address: data.formattedAddress,
    phone: data.nationalPhoneNumber,
    website: data.websiteUri,
  };
}
