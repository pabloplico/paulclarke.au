export type CompanySuggestion = {
  source: 'abn' | 'places';
  companyName: string;
  abn?: string;
  entityType?: string;
  address?: string;
  state?: string;
  postcode?: string;
  website?: string;
  phone?: string;
  industry?: string;
  gstRegistered?: boolean;
  placeId?: string;
  description?: string;
};

export type AddressPrediction = {
  placeId: string;
  description: string;
};
