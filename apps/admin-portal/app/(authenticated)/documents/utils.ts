export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelativeDate(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const PROCESSING_STATUSES = new Set([
  'uploaded',
  'extracting',
  'cleaning',
  'chunking',
  'embedding',
  'analyzing',
]);

export function isProcessing(status: string): boolean {
  return PROCESSING_STATUSES.has(status);
}

export const ACCEPTED_FILE_TYPES = '.pdf,.docx,.txt,.md,.markdown,.csv';

export type StatusFilter = 'all' | 'processing' | 'ready' | 'error' | 'archived';

export function matchesFilter(status: string, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'processing') return isProcessing(status);
  return status === filter;
}

export const DOCUMENT_TYPES = [
  'invoice',
  'contract',
  'procedure',
  'policy',
  'research',
  'report',
  'manual',
  'correspondence',
  'proposal',
  'other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const TYPE_CONFIG: Record<DocumentType, { label: string; className: string }> = {
  invoice: { label: 'Invoice', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  contract: { label: 'Contract', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  procedure: {
    label: 'Procedure',
    className: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  },
  policy: { label: 'Policy', className: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  research: {
    label: 'Research',
    className: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  },
  report: {
    label: 'Report',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  manual: { label: 'Manual', className: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
  correspondence: {
    label: 'Correspondence',
    className: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  },
  proposal: {
    label: 'Proposal',
    className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  other: { label: 'Other', className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
};

export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  uploaded: { label: 'Uploaded', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  extracting: {
    label: 'Extracting',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  cleaning: {
    label: 'Cleaning',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  chunking: {
    label: 'Chunking',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  embedding: {
    label: 'Embedding',
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  analyzing: {
    label: 'Analyzing',
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  ready: { label: 'Ready', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  error: { label: 'Error', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
};
