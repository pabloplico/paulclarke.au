'use client';

import { useCallback } from 'react';
import type { AddressPrediction, CompanySuggestion } from '@/lib/external-apis/types';

export function useCompanyLookup(
  updateFields: (fields: Record<string, string | Record<string, unknown>>) => void
) {
  const fetchCompanySuggestions = useCallback(
    async (query: string): Promise<CompanySuggestion[]> => {
      const res = await fetch(`/api/lookup/company?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.suggestions || [];
    },
    []
  );

  const fetchAddressPredictions = useCallback(
    async (query: string): Promise<AddressPrediction[]> => {
      const res = await fetch(`/api/lookup/address?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.predictions || [];
    },
    []
  );

  const handleCompanySelect = useCallback(
    async (suggestion: CompanySuggestion) => {
      const fields: Record<string, string | Record<string, unknown>> = {};

      if (suggestion.companyName) fields.companyName = suggestion.companyName;
      if (suggestion.address) fields.address = suggestion.address;
      if (suggestion.website) fields.website = suggestion.website;
      if (suggestion.phone) fields.phone = suggestion.phone;
      if (suggestion.industry) fields.industry = suggestion.industry;

      // Store ABN data in metadata
      if (suggestion.abn || suggestion.entityType || suggestion.gstRegistered !== undefined) {
        fields.metadata = {
          ...(suggestion.abn && { abn: suggestion.abn }),
          ...(suggestion.entityType && { entityType: suggestion.entityType }),
          ...(suggestion.gstRegistered !== undefined && {
            gstRegistered: suggestion.gstRegistered,
          }),
        };
      }

      updateFields(fields);

      // If we have a placeId but no detailed info, fetch place details
      if (suggestion.placeId && !suggestion.phone && !suggestion.website) {
        try {
          const res = await fetch(
            `/api/lookup/place-details?placeId=${encodeURIComponent(suggestion.placeId)}`
          );
          if (res.ok) {
            const details = await res.json();
            const extra: Record<string, string> = {};
            if (details.address) extra.address = details.address;
            if (details.phone) extra.phone = details.phone;
            if (details.website) extra.website = details.website;
            if (Object.keys(extra).length > 0) updateFields(extra);
          }
        } catch {
          // Silently fail enrichment
        }
      }
    },
    [updateFields]
  );

  const handleAddressSelect = useCallback(
    async (prediction: AddressPrediction) => {
      try {
        const res = await fetch(
          `/api/lookup/place-details?placeId=${encodeURIComponent(prediction.placeId)}`
        );
        if (res.ok) {
          const details = await res.json();
          if (details.address) updateFields({ address: details.address });
        }
      } catch {
        // Use the prediction description as fallback
        updateFields({ address: prediction.description });
      }
    },
    [updateFields]
  );

  const lookupAbn = useCallback(
    async (abn: string) => {
      const res = await fetch(`/api/lookup/abn?abn=${encodeURIComponent(abn)}`);
      if (!res.ok) return null;
      const result: CompanySuggestion = await res.json();

      const fields: Record<string, string | Record<string, unknown>> = {};
      if (result.companyName) fields.companyName = result.companyName;
      if (result.address) fields.address = result.address;
      if (result.website) fields.website = result.website;
      if (result.description) fields.notes = result.description;

      fields.metadata = {
        abn: result.abn,
        ...(result.entityType && { entityType: result.entityType }),
        ...(result.gstRegistered !== undefined && { gstRegistered: result.gstRegistered }),
      };

      updateFields(fields);
      return result;
    },
    [updateFields]
  );

  return {
    fetchCompanySuggestions,
    fetchAddressPredictions,
    handleCompanySelect,
    handleAddressSelect,
    lookupAbn,
  };
}
