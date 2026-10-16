import { create } from 'zustand';
import type { ConversationScope } from '@/lib/db/schema';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
}

export interface ChatSource {
  chunkId: number;
  documentId: number;
  documentTitle: string;
  chunkIndex: number;
  score: number;
  preview: string;
}

export interface ConversationSummary {
  id: number;
  title: string | null;
  scope: ConversationScope | null;
  createdAt: string;
  updatedAt: string;
}

interface ChatState {
  open: boolean;
  expanded: boolean;
  historyOpen: boolean;
  scope: ConversationScope;
  conversationId: number | null;
  messages: ChatMessage[];
  loading: boolean;
  contextTruncated: boolean;
  conversations: ConversationSummary[];
  conversationsLoading: boolean;

  toggle: () => void;
  setOpen: (open: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  setHistoryOpen: (open: boolean) => void;
  setScope: (scope: ConversationScope) => void;
  clear: () => void;
  newChat: () => void;
  send: (message: string) => Promise<void>;
  fetchConversations: () => Promise<void>;
  loadConversation: (id: number) => Promise<void>;
  deleteConversation: (id: number) => Promise<void>;
  resumeLastConversation: () => Promise<void>;
}

function scopeParams(scope: ConversationScope): string {
  if (scope.type === 'workspace') return `scope_type=workspace&scope_id=${scope.workspaceId}`;
  if (scope.type === 'kb') return `scope_type=kb&scope_id=${scope.knowledgeBaseId}`;
  return 'scope_type=general';
}

/**
 * Moves on whenever the user changes the conversation (send, new chat, clear,
 * scope change, picking one from history). A background resume that finds it
 * moved since it started drops its result, so it can't replace a conversation
 * the user has already started.
 */
let conversationGeneration = 0;

type LoadedConversation = Pick<ChatState, 'conversationId' | 'messages' | 'scope'>;

/** A conversation and its messages, as the store holds them; null if it can't be loaded. */
async function fetchConversation(
  id: number,
  fallbackScope: ConversationScope
): Promise<LoadedConversation | null> {
  const res = await fetch(`/api/chat/conversations/${id}/messages`);
  if (!res.ok) return null;

  const data = await res.json();
  const messages: ChatMessage[] = data.messages.map(
    (m: { role: string; content: string; sources?: Record<string, unknown>[] }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      sources: m.sources,
    })
  );
  const conv = data.conversation;
  return { conversationId: conv.id, messages, scope: conv.scope ?? fallbackScope };
}

export const useChatStore = create<ChatState>((set, get) => ({
  open: false,
  expanded: false,
  historyOpen: false,
  scope: { type: 'general' },
  conversationId: null,
  messages: [],
  contextTruncated: false,
  loading: false,
  conversations: [],
  conversationsLoading: false,

  toggle: () => {
    const wasOpen = get().open;
    set((s) => ({ open: !s.open }));
    if (!wasOpen) {
      // Opening — resume last conversation if none active
      const { conversationId, messages } = get();
      if (!conversationId && messages.length === 0) {
        get().resumeLastConversation();
      }
    }
  },

  setOpen: (open) => set({ open }),

  setExpanded: (expanded) => set({ expanded }),

  setHistoryOpen: (historyOpen) => {
    set({ historyOpen });
    if (historyOpen) get().fetchConversations();
  },

  setScope: (scope) => {
    const current = get().scope;
    const changed =
      scope.type !== current.type ||
      (scope.type === 'workspace' &&
        current.type === 'workspace' &&
        scope.workspaceId !== current.workspaceId) ||
      (scope.type === 'kb' &&
        current.type === 'kb' &&
        scope.knowledgeBaseId !== current.knowledgeBaseId);

    if (changed) {
      conversationGeneration++;
      set({
        scope,
        conversationId: null,
        messages: [],
        contextTruncated: false,
        conversations: [],
      });
      get().resumeLastConversation();
    }
  },

  clear: () => {
    conversationGeneration++;
    set({ conversationId: null, messages: [], contextTruncated: false });
  },
  newChat: () => {
    conversationGeneration++;
    set({ conversationId: null, messages: [], contextTruncated: false });
  },

  fetchConversations: async () => {
    const { scope } = get();
    set({ conversationsLoading: true });
    try {
      const res = await fetch(`/api/chat/conversations?${scopeParams(scope)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        set({ conversations: data });
      }
    } finally {
      set({ conversationsLoading: false });
    }
  },

  loadConversation: async (id: number) => {
    conversationGeneration++;
    set({ loading: true });
    try {
      const loaded = await fetchConversation(id, get().scope);
      if (loaded) set({ ...loaded, contextTruncated: false, historyOpen: false });
    } finally {
      set({ loading: false });
    }
  },

  deleteConversation: async (id: number) => {
    const res = await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' });
    if (!res.ok) return;

    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      ...(s.conversationId === id
        ? { conversationId: null, messages: [], contextTruncated: false }
        : {}),
    }));
  },

  resumeLastConversation: async () => {
    // In the background: it doesn't set loading (which would block sending),
    // and it gives up if the user has changed the conversation meanwhile
    const generation = conversationGeneration;
    const { scope } = get();
    try {
      const res = await fetch(`/api/chat/conversations?${scopeParams(scope)}&limit=1`);
      if (!res.ok || generation !== conversationGeneration) return;
      const data = await res.json();
      if (data.length === 0 || generation !== conversationGeneration) return;
      const loaded = await fetchConversation(data[0].id, scope);
      if (loaded && generation === conversationGeneration) {
        set({ ...loaded, contextTruncated: false });
      }
    } catch {
      // Silently fail — user just gets a fresh chat
    }
  },

  send: async (message: string) => {
    conversationGeneration++;
    const { scope, conversationId, messages } = get();

    const userMsg: ChatMessage = { role: 'user', content: message };
    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    set({ messages: [...messages, userMsg, assistantMsg], loading: true });

    try {
      const res = await fetch('/api/chat/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId, scope }),
      });

      if (!res.ok) throw new Error('Chat failed');

      // Read metadata from headers
      const newConversationId = res.headers.get('X-Conversation-Id');
      const sourcesHeader = res.headers.get('X-Sources');
      let sources: ChatSource[] | undefined;
      if (sourcesHeader) {
        try {
          const parsed = JSON.parse(sourcesHeader);
          sources = Array.isArray(parsed) ? parsed : undefined;
        } catch {
          sources = undefined;
        }
      }

      if (newConversationId) {
        set({ conversationId: Number(newConversationId) });
      }

      const truncatedHeader = res.headers.get('X-Context-Truncated');
      if (truncatedHeader === 'true') {
        set({ contextTruncated: true });
      }

      // Stream the raw text response
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          set((s) => {
            const msgs = [...s.messages];
            const last = msgs[msgs.length - 1];
            if (last?.role === 'assistant') {
              msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
            }
            return { messages: msgs };
          });
        }
      }

      // Attach sources to the final assistant message
      if (sources) {
        set((s) => {
          const msgs = [...s.messages];
          const last = msgs[msgs.length - 1];
          if (last?.role === 'assistant') {
            msgs[msgs.length - 1] = { ...last, sources };
          }
          return { messages: msgs };
        });
      }

      // Update conversations list with this conversation
      const activeId = get().conversationId;
      if (activeId) {
        set((s) => {
          const exists = s.conversations.some((c) => c.id === activeId);
          if (exists) {
            return {
              conversations: s.conversations.map((c) =>
                c.id === activeId ? { ...c, updatedAt: new Date().toISOString() } : c
              ),
            };
          }
          return {
            conversations: [
              {
                id: activeId,
                title: message.slice(0, 100),
                scope: s.scope,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              ...s.conversations,
            ],
          };
        });
      }

      set({ loading: false });
    } catch {
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          msgs[msgs.length - 1] = { ...last, content: 'Sorry, something went wrong.' };
        } else {
          msgs.push({ role: 'assistant', content: 'Sorry, something went wrong.' });
        }
        return { messages: msgs, loading: false };
      });
    }
  },
}));
