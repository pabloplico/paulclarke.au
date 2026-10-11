import type { RoutingSuggestion } from '@/lib/db/schema';

export type { RoutingSuggestion };

export type InboxItemType = 'file' | 'url' | 'note';
export type InboxItemStatus = 'pending' | 'processing' | 'routed' | 'failed' | 'dismissed';

export type WorkspaceMapEntry = {
  workspaceId: number;
  workspaceTitle: string;
  workspaceDescription: string | null;
  sections: {
    sectionId: number;
    sectionTitle: string;
    sectionDescription: string | null;
    template: string;
    contentPreview: string;
  }[];
};

export type RoutingJobData = {
  inboxItemId: number;
};
