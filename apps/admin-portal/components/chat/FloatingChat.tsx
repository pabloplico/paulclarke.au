'use client';

import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import {
  BookOpen,
  ChevronDown,
  Globe,
  History,
  Layers,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ChatSource, ConversationSummary } from './store';
import { useChatStore } from './store';
import { useAutoScope } from './use-auto-scope';

interface ScopeOption {
  label: string;
  type: 'workspace' | 'kb' | 'general';
  id?: number;
  icon: typeof Layers;
}

interface FloatingChatProps {
  workspaceMap?: Map<string, number>;
  workspaces?: { id: number; title: string; slug: string }[];
  knowledgeBases?: { id: number; name: string }[];
}

export function FloatingChat({ workspaceMap, workspaces, knowledgeBases }: FloatingChatProps) {
  useAutoScope(workspaceMap);

  const {
    open,
    expanded,
    historyOpen,
    scope,
    conversationId,
    messages,
    loading,
    contextTruncated,
    conversations,
    conversationsLoading,
    toggle,
    setExpanded,
    setHistoryOpen,
    setScope,
    newChat,
    send,
    setOpen,
    loadConversation,
    deleteConversation,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scopeMenuRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll must trigger on message changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.content]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close scope menu on outside click
  useEffect(() => {
    if (!scopeMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (scopeMenuRef.current && !scopeMenuRef.current.contains(e.target as Node)) {
        setScopeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [scopeMenuOpen]);

  // Keyboard: Escape hierarchy — expanded → history → close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        if (expanded) {
          setExpanded(false);
        } else if (historyOpen) {
          setHistoryOpen(false);
        } else {
          setOpen(false);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, expanded, historyOpen, setExpanded, setHistoryOpen, setOpen]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    await send(text);
  }, [input, loading, send]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Build scope options
  const scopeOptions: ScopeOption[] = [
    { label: 'General', type: 'general', icon: Globe },
    ...(workspaces ?? []).map((w) => ({
      label: w.title,
      type: 'workspace' as const,
      id: w.id,
      icon: Layers,
    })),
    ...(knowledgeBases ?? []).map((kb) => ({
      label: kb.name,
      type: 'kb' as const,
      id: kb.id,
      icon: BookOpen,
    })),
  ];

  const currentScopeLabel = getScopeLabel(scope, workspaces, knowledgeBases);
  const ScopeIcon = getScopeIcon(scope);

  // ── FAB button ─────────────────────────────────────────────────────────────

  if (!open) {
    return (
      <Button
        onClick={toggle}
        className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg p-0 z-50"
        title="Open chat"
      >
        <MessageSquare size={20} />
      </Button>
    );
  }

  // ── Chat panel ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop for expanded mode */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setExpanded(false)}
          aria-hidden="true"
        />
      )}

      <Card
        className={cn(
          'flex flex-col shadow-2xl z-50',
          expanded
            ? 'fixed inset-4 md:inset-8 lg:inset-x-[15%] lg:inset-y-[5%]'
            : 'fixed bottom-6 right-6 w-96 max-w-[calc(100vw-1.5rem)] h-[520px] max-h-[calc(100dvh-8rem)]'
        )}
        role="dialog"
        aria-modal={expanded}
        aria-label="Chat panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <div className="relative flex items-center gap-2 min-w-0" ref={scopeMenuRef}>
            <button
              type="button"
              onClick={() => setScopeMenuOpen(!scopeMenuOpen)}
              aria-expanded={scopeMenuOpen}
              aria-haspopup="listbox"
              aria-label={`Chat scope: ${currentScopeLabel}. Click to change.`}
              className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors min-w-0"
            >
              <ScopeIcon size={14} className="shrink-0 text-primary" />
              <span className="truncate max-w-[180px]">{currentScopeLabel}</span>
              <ChevronDown
                size={12}
                className={cn('shrink-0 transition-transform', scopeMenuOpen && 'rotate-180')}
              />
            </button>

            {/* Scope dropdown */}
            {scopeMenuOpen && (
              <div
                role="listbox"
                aria-label="Chat scope"
                className="absolute top-full left-0 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-card shadow-lg py-1 z-50 max-h-60 overflow-y-auto scrollbar-thin"
              >
                {scopeOptions.map((opt) => {
                  const isActive =
                    opt.type === scope.type &&
                    (opt.type === 'general' ||
                      (opt.type === 'workspace' &&
                        scope.type === 'workspace' &&
                        opt.id === scope.workspaceId) ||
                      (opt.type === 'kb' &&
                        scope.type === 'kb' &&
                        opt.id === scope.knowledgeBaseId));

                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      key={`${opt.type}-${opt.id ?? 'general'}`}
                      onClick={() => {
                        if (opt.type === 'workspace' && opt.id) {
                          setScope({ type: 'workspace', workspaceId: opt.id });
                        } else if (opt.type === 'kb' && opt.id) {
                          setScope({ type: 'kb', knowledgeBaseId: opt.id });
                        } else {
                          setScope({ type: 'general' });
                        }
                        setScopeMenuOpen(false);
                      }}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors',
                        isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-white/5'
                      )}
                    >
                      <opt.icon size={14} className="shrink-0" />
                      <span className="truncate">{opt.label}</span>
                      {opt.type !== 'general' && (
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                          {opt.type === 'workspace' ? 'Workspace' : 'KB'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={newChat}
                className="h-7 w-7 p-0"
                title="New chat"
              >
                <Plus size={14} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistoryOpen(!historyOpen)}
              className={cn('h-7 w-7 p-0', historyOpen && 'text-primary')}
              title="Chat history"
            >
              <History size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-7 w-7 p-0"
              title={expanded ? 'Minimize' : 'Maximize'}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              className="h-7 w-7 p-0"
              aria-label="Close chat"
            >
              <X size={14} />
            </Button>
          </div>
        </div>

        {/* Body: history sidebar (expanded) or history overlay (floating) + messages */}
        <div className="flex flex-1 overflow-hidden">
          {/* History sidebar — only in expanded mode */}
          {historyOpen && expanded && (
            <HistoryPanel
              conversations={conversations}
              conversationsLoading={conversationsLoading}
              activeConversationId={conversationId}
              onSelect={loadConversation}
              onDelete={deleteConversation}
              onNewChat={newChat}
            />
          )}

          <div className="flex flex-1 flex-col overflow-hidden">
            {/* History overlay — only in floating mode */}
            {historyOpen && !expanded && (
              <HistoryPanel
                conversations={conversations}
                conversationsLoading={conversationsLoading}
                activeConversationId={conversationId}
                onSelect={loadConversation}
                onDelete={deleteConversation}
                onNewChat={newChat}
                overlay
              />
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare size={24} className="text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {scope.type === 'workspace'
                      ? 'Ask anything about this workspace.'
                      : scope.type === 'kb'
                        ? 'Ask questions using knowledge base sources.'
                        : 'Ask me anything.'}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {scope.type === 'workspace'
                      ? 'AI has full context of all sections.'
                      : scope.type === 'kb'
                        ? 'Answers cite relevant source documents.'
                        : 'No context — general assistant mode.'}
                  </p>
                </div>
              )}

              {contextTruncated && messages.length > 0 && (
                <div className="mx-2 rounded bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-[10px] text-amber-400">
                  Some workspace content was excluded due to size limits.
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={`${msg.role}-${i}`}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={cn('max-w-[85%]', expanded && 'max-w-[70%]')}>
                    <div
                      className={cn(
                        'rounded-lg px-3 py-2 leading-relaxed',
                        expanded ? 'text-sm' : 'text-xs',
                        msg.role === 'user'
                          ? 'bg-primary/10 border border-primary/20 text-foreground'
                          : 'bg-white/[0.03] border border-border text-foreground'
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <SourceBadges sources={msg.sources} />
                    )}
                  </div>
                </div>
              ))}

              {loading && messages[messages.length - 1]?.content === '' && (
                <div className="flex justify-start">
                  <div
                    role="status"
                    aria-label="Waiting for the answer"
                    className="rounded-lg bg-white/[0.03] border border-border px-3 py-2"
                  >
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border px-3 py-2 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question..."
                  rows={1}
                  className={cn(
                    'flex-1 resize-none min-h-[36px] rounded-md border border-border bg-white/5 px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring',
                    expanded ? 'text-sm max-h-[120px]' : 'text-xs max-h-[80px]'
                  )}
                  disabled={loading}
                />
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="h-9 w-9 p-0 shrink-0"
                  aria-label="Send message"
                >
                  <Send size={14} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}

// ── History Panel ──────────────────────────────────────────────────────────────

function HistoryPanel({
  conversations,
  conversationsLoading,
  activeConversationId,
  onSelect,
  onDelete,
  onNewChat,
  overlay,
}: {
  conversations: ConversationSummary[];
  conversationsLoading: boolean;
  activeConversationId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onNewChat: () => void;
  overlay?: boolean;
}) {
  const grouped = groupConversations(conversations);

  return (
    <div
      className={cn(
        'border-border bg-card overflow-y-auto scrollbar-thin',
        overlay ? 'border-b max-h-[300px]' : 'border-r w-[260px] shrink-0'
      )}
    >
      <div className="p-2">
        <button
          type="button"
          onClick={onNewChat}
          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-white/5 transition-colors"
        >
          <Plus size={12} />
          New chat
        </button>
      </div>

      {conversationsLoading && conversations.length === 0 && (
        <div className="flex justify-center py-4">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {!conversationsLoading && conversations.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-4">No conversations yet</p>
      )}

      {grouped.map((group) => (
        <div key={group.label}>
          <p className="px-3 pt-3 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {group.label}
          </p>
          {group.items.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeConversationId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: {
  conversation: ConversationSummary;
  isActive: boolean;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={cn(
        'group flex items-center gap-1 px-2 mx-1 rounded-md transition-colors',
        isActive ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-white/5'
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        className="flex-1 text-left py-1.5 min-w-0"
      >
        <p className="text-xs text-foreground truncate">{conversation.title ?? 'Untitled'}</p>
        <p className="text-[10px] text-muted-foreground">
          {formatRelativeTime(conversation.updatedAt)}
          {conversation.scope && (
            <span className="ml-1.5 text-muted-foreground/60">
              {scopeLabel(conversation.scope)}
            </span>
          )}
        </p>
      </button>
      {hovered && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(conversation.id);
          }}
          className="shrink-0 p-1 rounded text-muted-foreground hover:text-red-400 transition-colors"
          title="Delete conversation"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

// ── Source Badges ───────────────────────────────────────────────────────────────

function SourceBadges({ sources }: { sources: ChatSource[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {sources.length} source{sources.length !== 1 ? 's' : ''} {expanded ? '(hide)' : '(show)'}
      </button>
      {expanded && (
        <div className="flex flex-wrap gap-1 mt-1">
          {sources.map((s, i) => (
            <span
              key={s.chunkId}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] text-primary"
              title={s.preview}
            >
              [{i + 1}] {s.documentTitle}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getScopeLabel(
  scope: { type: string; workspaceId?: number; knowledgeBaseId?: number },
  workspaces?: { id: number; title: string }[],
  knowledgeBases?: { id: number; name: string }[]
): string {
  if (scope.type === 'workspace' && 'workspaceId' in scope) {
    const ws = workspaces?.find((w) => w.id === scope.workspaceId);
    return ws?.title ?? 'Workspace';
  }
  if (scope.type === 'kb' && 'knowledgeBaseId' in scope) {
    const kb = knowledgeBases?.find((k) => k.id === scope.knowledgeBaseId);
    return kb?.name ?? 'Knowledge Base';
  }
  return 'General';
}

function getScopeIcon(scope: { type: string }) {
  if (scope.type === 'workspace') return Layers;
  if (scope.type === 'kb') return BookOpen;
  return Globe;
}

function scopeLabel(scope: { type: string }): string {
  if (scope.type === 'workspace') return 'Workspace';
  if (scope.type === 'kb') return 'KB';
  return 'General';
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

interface ConversationGroup {
  label: string;
  items: ConversationSummary[];
}

function groupConversations(conversations: ConversationSummary[]): ConversationGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const lastWeek = new Date(today.getTime() - 7 * 86_400_000);

  const todayItems: ConversationSummary[] = [];
  const yesterdayItems: ConversationSummary[] = [];
  const lastWeekItems: ConversationSummary[] = [];
  const olderItems: ConversationSummary[] = [];

  for (const conv of conversations) {
    const d = new Date(conv.updatedAt);
    if (d >= today) todayItems.push(conv);
    else if (d >= yesterday) yesterdayItems.push(conv);
    else if (d >= lastWeek) lastWeekItems.push(conv);
    else olderItems.push(conv);
  }

  const groups: [string, ConversationSummary[]][] = [
    ['Today', todayItems],
    ['Yesterday', yesterdayItems],
    ['Last 7 days', lastWeekItems],
    ['Older', olderItems],
  ];

  return groups.filter(([, items]) => items.length > 0).map(([label, items]) => ({ label, items }));
}
