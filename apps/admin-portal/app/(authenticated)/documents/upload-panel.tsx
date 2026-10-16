'use client';

import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import { Input } from '@repo/ui/input';
import { toast } from '@repo/ui/sonner';
import { Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentWithChunks } from './page';
import { useDocumentStore } from './store';
import { ACCEPTED_FILE_TYPES, formatFileSize } from './utils';

interface UploadPanelProps {
  onUploaded: (doc: DocumentWithChunks) => void;
}

export function UploadPanel({ onUploaded }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        useDocumentStore.getState().toggleUpload();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFile = useCallback((f: File) => {
    setFile(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (title.trim()) formData.append('title', title.trim());
      if (tags.trim()) {
        const tagArray = tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        formData.append('userTags', JSON.stringify(tagArray));
      }

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const doc = await res.json();
      onUploaded({ ...doc, chunkCount: 0 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-primary bg-primary/5' : 'border-white/10 hover:border-white/20'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {file ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{file.name}</span>
                <span className="text-muted-foreground">({formatFileSize(file.size)})</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove file"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Drop a file here or click to browse</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  PDF, DOCX, TXT, Markdown, CSV
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input
              placeholder="Tags, comma-separated"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={!file || uploading} size="sm">
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
