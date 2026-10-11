import { Badge } from '@repo/ui/badge';
import { FileSpreadsheet, FileText, FileType, Loader2 } from 'lucide-react';
import { isProcessing, STATUS_CONFIG } from './utils';

export function FileIcon({ mime }: { mime: string }) {
  if (mime.includes('pdf')) return <FileText className="h-5 w-5 text-red-400" />;
  if (mime.includes('csv') || mime.includes('spreadsheet'))
    return <FileSpreadsheet className="h-5 w-5 text-green-400" />;
  if (mime.includes('word') || mime.includes('docx'))
    return <FileType className="h-5 w-5 text-blue-400" />;
  return <FileText className="h-5 w-5 text-muted-foreground" />;
}

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-white/10 text-white/60 border-white/20',
  };
  return (
    <Badge variant="outline" className={`gap-1.5 ${config.className}`}>
      {isProcessing(status) && <Loader2 className="h-3 w-3 animate-spin" />}
      {config.label}
    </Badge>
  );
}

export function MetaItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value == null || value === '') return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
