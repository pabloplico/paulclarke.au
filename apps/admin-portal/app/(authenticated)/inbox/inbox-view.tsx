'use client';

import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import { Inbox, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DropZone } from './drop-zone';
import { InboxItemCard } from './inbox-item';
import { type InboxItem, useInboxStore } from './store';

interface InboxViewProps {
  initialItems: InboxItem[];
}

export function InboxView({ initialItems }: InboxViewProps) {
  const { items, setItems, addItem, updateItem, removeItem } = useInboxStore();

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems, setItems]);

  // Poll for status updates — fast when items are pending/processing, slow otherwise
  // to catch reprocessed documents that re-enter the inbox
  useEffect(() => {
    const hasPending = items.some((i) => i.status === 'pending' || i.status === 'processing');
    const pollInterval = hasPending ? 3000 : 15000;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/inbox');
        if (res.ok) {
          const freshItems: InboxItem[] = await res.json();
          setItems(freshItems);
        }
      } catch {
        // ignore polling errors
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [items, setItems]);

  const handleItemCreated = useCallback(
    (item: InboxItem) => {
      addItem(item);
    },
    [addItem]
  );

  const [clearing, setClearing] = useState(false);

  const clearDismissed = useCallback(async () => {
    setClearing(true);
    try {
      const res = await fetch('/api/inbox/dismissed', { method: 'DELETE' });
      if (res.ok) {
        setItems(items.filter((i) => i.status !== 'dismissed'));
      }
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  }, [items, setItems]);

  const activeItems = items.filter((i) => i.status !== 'dismissed' && i.status !== 'approved');
  const approvedItems = items.filter((i) => i.status === 'approved');
  const dismissedItems = items.filter((i) => i.status === 'dismissed');

  return (
    <div className="space-y-6">
      <DropZone onItemCreated={handleItemCreated} />

      {activeItems.length === 0 && approvedItems.length === 0 && dismissedItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox size={40} className="text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Inbox is empty.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a note, file, or URL above to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activeItems.map((item) => (
            <InboxItemCard key={item.id} item={item} onUpdate={updateItem} onRemove={removeItem} />
          ))}
          {approvedItems.length > 0 && (
            <details className="group" open>
              <summary className="text-xs text-green-400 cursor-pointer hover:text-green-300 transition-colors">
                {approvedItems.length} approved {approvedItems.length === 1 ? 'item' : 'items'}
              </summary>
              <div className="space-y-3 mt-3">
                {approvedItems.map((item) => (
                  <InboxItemCard
                    key={item.id}
                    item={item}
                    onUpdate={updateItem}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            </details>
          )}
          {dismissedItems.length > 0 && (
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                {dismissedItems.length} dismissed {dismissedItems.length === 1 ? 'item' : 'items'}
              </summary>
              <div className="mt-3 space-y-3">
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={clearDismissed}
                    disabled={clearing}
                  >
                    <Trash2 size={12} className="mr-1" />
                    {clearing ? 'Clearing...' : 'Clear all dismissed'}
                  </Button>
                </div>
                {dismissedItems.map((item) => (
                  <InboxItemCard
                    key={item.id}
                    item={item}
                    onUpdate={updateItem}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
