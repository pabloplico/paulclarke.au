'use client';

import { Button } from '@repo/ui/button';
import { toast } from '@repo/ui/sonner';
import { BookOpen, Plus } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import type { KnowledgeBaseWithStats } from '@/lib/types';
import { CreatePanel } from './create-panel';
import { KbCard } from './kb-card';
import { useKnowledgeBaseStore } from './store';

interface KnowledgeBaseViewProps {
  initialKnowledgeBases: KnowledgeBaseWithStats[];
}

export function KnowledgeBaseView({ initialKnowledgeBases }: KnowledgeBaseViewProps) {
  const {
    knowledgeBases,
    showCreate,
    setKnowledgeBases,
    addKnowledgeBase,
    removeKnowledgeBase,
    toggleCreate,
  } = useKnowledgeBaseStore();

  useEffect(() => {
    setKnowledgeBases(initialKnowledgeBases);
  }, [initialKnowledgeBases, setKnowledgeBases]);

  const handleCreated = useCallback(
    (kb: KnowledgeBaseWithStats) => {
      addKnowledgeBase(kb);
    },
    [addKnowledgeBase]
  );

  const handleDelete = useCallback(
    async (id: number, name: string) => {
      removeKnowledgeBase(id);

      try {
        const res = await fetch(`/api/knowledge-bases/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        toast.success(`${name} deleted`);
      } catch {
        // Re-fetch to restore state on failure
        const res = await fetch('/api/knowledge-bases');
        if (res.ok) {
          const data: KnowledgeBaseWithStats[] = await res.json();
          setKnowledgeBases(data);
        }
        toast.error('Failed to delete knowledge base');
      }
    },
    [removeKnowledgeBase, setKnowledgeBases]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={toggleCreate}>
          <Plus className="h-4 w-4" />
          New Knowledge Base
        </Button>
      </div>

      {showCreate && <CreatePanel onCreated={handleCreated} />}

      {knowledgeBases.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {knowledgeBases.map((kb) => (
            <KbCard key={kb.id} kb={kb} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">
            No knowledge bases yet. Create one to get started.
          </p>
        </div>
      )}
    </div>
  );
}
