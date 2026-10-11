'use client';

import { Button } from '@repo/ui/button';
import {
  BookOpen,
  Expand,
  ExternalLink,
  MessageSquare,
  Minimize2,
  PenLine,
  Search,
  Tags,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export type AiEditAction =
  | 'rewrite'
  | 'expand'
  | 'simplify'
  | 'analyse'
  | 'research'
  | 'find_source'
  | 'custom';

interface AiEditToolbarProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onAction: (action: AiEditAction, selectedText: string, customPrompt?: string) => void;
  onExtractChild?: (selectedText: string) => void;
}

const ACTIONS: {
  action: AiEditAction;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}[] = [
  { action: 'rewrite', label: 'Rewrite', icon: PenLine },
  { action: 'expand', label: 'Expand', icon: Expand },
  { action: 'simplify', label: 'Simplify', icon: Minimize2 },
  { action: 'analyse', label: 'Analyse', icon: Tags },
  { action: 'research', label: 'Research', icon: Search },
  { action: 'find_source', label: 'Find Source', icon: BookOpen },
  { action: 'custom', label: 'Custom', icon: MessageSquare },
];

export function AiEditToolbar({ containerRef, onAction, onExtractChild }: AiEditToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedText, setSelectedText] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !containerRef.current) {
      // Don't hide if custom input is focused
      if (showCustomInput && customInputRef.current === document.activeElement) return;
      setVisible(false);
      setShowCustomInput(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();

    // Only show if selection is within our container
    if (!text || !containerRef.current.contains(range.commonAncestorContainer)) {
      setVisible(false);
      setShowCustomInput(false);
      return;
    }

    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    setPosition({
      top: rect.top - containerRect.top - 44,
      left: rect.left - containerRect.left + rect.width / 2,
    });
    setSelectedText(text);
    setVisible(true);
  }, [containerRef, showCustomInput]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  // Hide toolbar on click outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        // Let selection change handler deal with it
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const handleAction = useCallback(
    (action: AiEditAction) => {
      if (action === 'custom') {
        setShowCustomInput(true);
        setTimeout(() => customInputRef.current?.focus(), 0);
        return;
      }
      onAction(action, selectedText);
      setVisible(false);
      window.getSelection()?.removeAllRanges();
    },
    [onAction, selectedText]
  );

  const handleCustomSubmit = useCallback(() => {
    if (!customPrompt.trim()) return;
    onAction('custom', selectedText, customPrompt.trim());
    setVisible(false);
    setShowCustomInput(false);
    setCustomPrompt('');
    window.getSelection()?.removeAllRanges();
  }, [onAction, selectedText, customPrompt]);

  if (!visible) return null;

  return (
    <div
      ref={toolbarRef}
      className="absolute z-50 animate-in fade-in slide-in-from-bottom-1 duration-150"
      style={{
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg">
        {ACTIONS.map(({ action, label, icon: Icon }) => (
          <Button
            key={action}
            variant="ghost"
            size="sm"
            onClick={() => handleAction(action)}
            className="h-7 px-2 text-xs gap-1"
            title={label}
          >
            <Icon size={12} />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
        {onExtractChild && (
          <>
            <div className="w-px h-4 bg-border/50 mx-0.5" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onExtractChild(selectedText);
                setVisible(false);
                window.getSelection()?.removeAllRanges();
              }}
              className="h-7 px-2 text-xs gap-1"
              title="Extract to child section"
            >
              <ExternalLink size={12} />
              <span className="hidden sm:inline">Extract</span>
            </Button>
          </>
        )}
      </div>

      {showCustomInput && (
        <div className="mt-1 flex gap-1 rounded-lg border border-border bg-popover p-1 shadow-lg">
          <input
            ref={customInputRef}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
            placeholder="Describe what to do..."
            aria-label="Custom AI edit prompt"
            className="flex-1 bg-transparent px-2 py-1 text-xs text-foreground focus:outline-none min-w-0 w-full sm:min-w-[200px]"
          />
          <Button
            variant="default"
            size="sm"
            onClick={handleCustomSubmit}
            disabled={!customPrompt.trim()}
            className="h-6 px-2 text-xs"
          >
            Go
          </Button>
        </div>
      )}
    </div>
  );
}
