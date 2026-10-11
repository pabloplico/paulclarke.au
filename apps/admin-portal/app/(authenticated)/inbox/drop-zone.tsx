'use client';

import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import { Input } from '@repo/ui/input';
import { FileUp, Globe, Loader2, StickyNote } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type { InboxItem } from './store';

type DropMode = 'file' | 'url' | 'note';

interface DropZoneProps {
  onItemCreated: (item: InboxItem) => void;
}

export function DropZone({ onItemCreated }: DropZoneProps) {
  const [mode, setMode] = useState<DropMode>('note');
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [url, setUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = useCallback(
    async (files: FileList) => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        setSubmitting(true);
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/api/inbox', { method: 'POST', body: formData });
          if (res.ok) {
            const item = await res.json();
            onItemCreated(item);
          }
        } finally {
          setSubmitting(false);
        }
      }
    },
    [onItemCreated]
  );

  const handleSubmitNote = useCallback(async () => {
    if (!noteTitle.trim() || !noteContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'note',
          title: noteTitle.trim(),
          content: noteContent.trim(),
        }),
      });
      if (res.ok) {
        const item = await res.json();
        onItemCreated(item);
        setNoteTitle('');
        setNoteContent('');
      }
    } finally {
      setSubmitting(false);
    }
  }, [noteTitle, noteContent, onItemCreated]);

  const handleSubmitUrl = useCallback(async () => {
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const input = url.trim();
      // Extract the URL from the input — user may paste "Title https://..." or just a bare URL
      const urlMatch = input.match(/https?:\/\/\S+/);
      const extractedUrl = urlMatch ? urlMatch[0] : input;
      const title = urlMatch ? input.replace(extractedUrl, '').trim() || extractedUrl : input;
      const res = await fetch('/api/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'url', title, content: extractedUrl }),
      });
      if (res.ok) {
        const item = await res.json();
        onItemCreated(item);
        setUrl('');
      }
    } finally {
      setSubmitting(false);
    }
  }, [url, onItemCreated]);

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold flex-1">Drop Zone</h3>
          <div className="flex gap-1">
            {(['note', 'file', 'url'] as const).map((m) => (
              <Button
                key={m}
                variant={mode === m ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode(m)}
                className="h-7 text-xs"
              >
                {m === 'file' && <FileUp size={12} className="mr-1" />}
                {m === 'url' && <Globe size={12} className="mr-1" />}
                {m === 'note' && <StickyNote size={12} className="mr-1" />}
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {mode === 'file' && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length > 0) handleFileDrop(e.dataTransfer.files);
            }}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/20'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={(e) => e.target.files && handleFileDrop(e.target.files)}
            />
            {submitting ? (
              <Loader2 size={24} className="mx-auto animate-spin text-muted-foreground" />
            ) : (
              <>
                <FileUp size={24} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Drop files here or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, MD, CSV, TXT</p>
              </>
            )}
          </div>
        )}

        {mode === 'url' && (
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitUrl()}
            />
            <Button onClick={handleSubmitUrl} disabled={submitting || !url.trim()} size="sm">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
            </Button>
          </div>
        )}

        {mode === 'note' && (
          <div className="space-y-2">
            <Input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note title"
            />
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Paste or type your notes here..."
              className="w-full min-h-[100px] rounded-md border border-border bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
            />
            <div className="flex justify-end">
              <Button
                onClick={handleSubmitNote}
                disabled={submitting || !noteTitle.trim() || !noteContent.trim()}
                size="sm"
              >
                {submitting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
                Add Note
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
