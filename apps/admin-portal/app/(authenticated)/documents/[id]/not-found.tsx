import { FileQuestion } from 'lucide-react';
import Link from 'next/link';

export default function DocumentNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <FileQuestion className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold mb-2">Document not found</h2>
      <p className="text-sm text-muted-foreground mb-6">
        The document you're looking for doesn't exist or has been deleted.
      </p>
      <Link href="/documents" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to documents
      </Link>
    </div>
  );
}
