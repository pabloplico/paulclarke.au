'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Checkbox } from '@repo/ui/checkbox';
import { toast } from '@repo/ui/sonner';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ListTodo,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export type Todo = {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  completedAt: string | null;
  priority: string;
  dueDate: string | null;
  sortOrder: number;
  jobId: number | null;
  clientId: number | null;
  createdAt: string;
  updatedAt: string;
  jobTitle: string | null;
  clientName: string | null;
};

type TabFilter = 'all' | 'active' | 'completed';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';
type ViewMode = 'week' | 'month';

const TAB_BUTTONS: { key: TabFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

const PRIORITY_BUTTONS: { key: PriorityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

interface TasksViewProps {
  initialTodos: Todo[];
  clients: { id: number; contactName: string }[];
  jobs: { id: number; title: string }[];
}

export function TasksView({ initialTodos, clients, jobs }: TasksViewProps) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos);

  // List state
  const [tab, setTab] = useState<TabFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // Calendar state
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showAdd, setShowAdd] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({
    title: '',
    priority: 'medium',
    jobId: '',
    clientId: '',
  });
  const [adding, setAdding] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // --- Shared handlers ---
  const handleToggle = useCallback(async (id: number, completed: boolean) => {
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, completed, completedAt: completed ? new Date().toISOString() : null }
          : t
      )
    );
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) {
        setTodos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, completed: !completed, completedAt: null } : t))
        );
        toast.error('Failed to update todo');
      }
    } catch {
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed: !completed, completedAt: null } : t))
      );
      toast.error('Failed to update todo');
    }
  }, []);

  const handleUpdate = useCallback(async (id: number, patch: Partial<Todo>) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) toast.error('Failed to update todo');
    } catch {
      toast.error('Failed to update todo');
    }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      if (!res.ok) toast.error('Failed to delete todo');
    } catch {
      toast.error('Failed to delete todo');
    }
  }, []);

  // --- List handlers ---
  const filtered = todos.filter((t) => {
    if (tab === 'active' && t.completed) return false;
    if (tab === 'completed' && !t.completed) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    return true;
  });

  const handleCreateFromList = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const todo = await res.json();
        setTodos((prev) => [
          {
            ...todo,
            completedAt: todo.completedAt ?? null,
            dueDate: todo.dueDate ?? null,
            jobTitle: null,
            clientName: null,
          },
          ...prev,
        ]);
        setNewTitle('');
      } else {
        toast.error('Failed to create todo');
      }
    } catch {
      toast.error('Failed to create todo');
    } finally {
      setCreating(false);
    }
  }, [newTitle]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBatchComplete = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBatchLoading(true);
    setTodos((prev) =>
      prev.map((t) =>
        ids.includes(t.id) ? { ...t, completed: true, completedAt: new Date().toISOString() } : t
      )
    );
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/todos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: true }),
          })
        )
      );
      setSelectedIds(new Set());
    } catch {
      toast.error('Failed to complete todos');
    } finally {
      setBatchLoading(false);
    }
  }, [selectedIds]);

  const handleBatchDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} todo${ids.length === 1 ? '' : 's'}?`)) return;
    setBatchLoading(true);
    setTodos((prev) => prev.filter((t) => !ids.includes(t.id)));
    try {
      await Promise.all(ids.map((id) => fetch(`/api/todos/${id}`, { method: 'DELETE' })));
      setSelectedIds(new Set());
    } catch {
      toast.error('Failed to delete todos');
    } finally {
      setBatchLoading(false);
    }
  }, [selectedIds]);

  const handleSaveTitle = (id: number) => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== todos.find((t) => t.id === id)?.title) {
      handleUpdate(id, { title: trimmed });
    }
    setEditingId(null);
  };

  // --- Calendar handlers ---
  const navigate = (dir: number) => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'week') next.setDate(next.getDate() + dir * 7);
      else next.setMonth(next.getMonth() + dir);
      return next;
    });
  };

  const days = useMemo(() => {
    const result: Date[] = [];
    if (viewMode === 'week') {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay() + 1);
      for (let i = 0; i < 7; i++) {
        result.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
      }
    } else {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const startOffset = (firstDay.getDay() + 6) % 7;
      const start = new Date(year, month, 1 - startOffset);
      for (let i = 0; i < 42; i++) {
        result.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
      }
    }
    return result;
  }, [currentDate, viewMode]);

  const toDateKey = (d: Date) => d.toISOString().slice(0, 10);
  const todosForDay = (date: Date) => {
    const dateStr = toDateKey(date);
    return todos.filter((t) => t.dueDate && t.dueDate.slice(0, 10) === dateStr);
  };
  const today = toDateKey(new Date());
  const isCurrentMonth = (d: Date) => d.getMonth() === currentDate.getMonth();

  const handleAddToCalendar = useCallback(
    async (dateStr: string) => {
      if (!addForm.title.trim()) return;
      setAdding(true);
      try {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: addForm.title.trim(),
            priority: addForm.priority,
            dueDate: new Date(dateStr).toISOString(),
            jobId: addForm.jobId ? Number(addForm.jobId) : null,
            clientId: addForm.clientId ? Number(addForm.clientId) : null,
          }),
        });
        if (res.ok) {
          const created = await res.json();
          const job = jobs.find((j) => j.id === created.jobId);
          const client = clients.find((c) => c.id === created.clientId);
          setTodos((prev) => [
            ...prev,
            {
              ...created,
              completedAt: created.completedAt ?? null,
              dueDate: created.dueDate ?? null,
              createdAt: created.createdAt ?? new Date().toISOString(),
              updatedAt: created.updatedAt ?? new Date().toISOString(),
              jobTitle: job?.title ?? null,
              clientName: client?.contactName ?? null,
            },
          ]);
          setAddForm({ title: '', priority: 'medium', jobId: '', clientId: '' });
          setShowAdd(null);
          toast.success('Task added');
        } else toast.error('Failed to add');
      } catch {
        toast.error('Failed to add');
      } finally {
        setAdding(false);
      }
    },
    [addForm, jobs, clients]
  );

  const handleDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData('text/plain', String(id));
  };

  const handleDrop = useCallback(async (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (!id) return;
    const newDueDate = new Date(dateStr).toISOString();
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, dueDate: newDueDate } : t)));
    try {
      await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: newDueDate }),
      });
    } catch {
      toast.error('Failed to reschedule');
    }
  }, []);

  const headerLabel =
    viewMode === 'week'
      ? `Week of ${days[0]?.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })} – ${days[6]?.toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : currentDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  const unscheduled = todos.filter((t) => !t.dueDate && !t.completed);

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Left panel: Todo list */}
      <div className="w-full md:w-[380px] shrink-0 flex flex-col min-h-0">
        <div className="space-y-3 flex flex-col min-h-0">
          {/* Add todo input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFromList();
              }}
              placeholder="Add a task..."
              className="flex-1 rounded-lg border border-white/10 bg-card px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:border-lime-500/50"
              disabled={creating}
            />
            <Button
              size="sm"
              onClick={handleCreateFromList}
              disabled={creating || !newTitle.trim()}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1 flex-wrap">
            {TAB_BUTTONS.map(({ key, label }) => (
              <Button
                key={key}
                variant={tab === key ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setTab(key)}
              >
                {label}
                {key !== 'all' && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {key === 'active'
                      ? todos.filter((t) => !t.completed).length
                      : todos.filter((t) => t.completed).length}
                  </span>
                )}
              </Button>
            ))}
            <span className="w-px h-4 bg-white/10 mx-1" />
            {PRIORITY_BUTTONS.map(({ key, label }) => (
              <Button
                key={key}
                variant={priorityFilter === key ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPriorityFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* Batch actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                disabled={batchLoading}
                onClick={handleBatchComplete}
              >
                <CheckCircle2 className="h-3 w-3" />
                Complete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-red-400 hover:text-red-300"
                disabled={batchLoading}
                onClick={handleBatchDelete}
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px] text-muted-foreground"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </div>
          )}

          {/* Todo list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 space-y-1.5 pr-1">
            {filtered.length > 0 ? (
              filtered.map((todo) => {
                const isOverdue =
                  todo.dueDate && !todo.completed && new Date(todo.dueDate) < new Date();
                return (
                  <div
                    key={todo.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, todo.id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg border border-white/5 bg-card px-3 py-2.5 transition-colors cursor-grab active:cursor-grabbing',
                      selectedIds.has(todo.id) && 'ring-1 ring-lime-500/30'
                    )}
                  >
                    <Checkbox
                      checked={selectedIds.has(todo.id)}
                      onChange={() => toggleSelect(todo.id)}
                      className="h-3 w-3"
                    />
                    <Checkbox
                      checked={todo.completed}
                      onChange={() => handleToggle(todo.id, !todo.completed)}
                      className="h-4 w-4"
                    />
                    <div className="flex-1 min-w-0">
                      {editingId === todo.id ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => handleSaveTitle(todo.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTitle(todo.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="w-full bg-transparent text-sm outline-none border-b border-lime-500/50"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(todo.id);
                            setEditTitle(todo.title);
                          }}
                          className={cn(
                            'text-sm text-left truncate w-full',
                            todo.completed && 'line-through text-muted-foreground'
                          )}
                        >
                          {todo.title}
                        </button>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${PRIORITY_COLORS[todo.priority] || PRIORITY_COLORS.medium}`}
                    >
                      {todo.priority}
                    </Badge>
                    {todo.dueDate && (
                      <span
                        className={cn(
                          'flex items-center gap-1 text-[11px] shrink-0',
                          isOverdue ? 'text-red-400' : 'text-muted-foreground'
                        )}
                      >
                        <Calendar className="h-3 w-3" />
                        {new Date(todo.dueDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400 shrink-0"
                      onClick={() => handleDelete(todo.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-12 text-center">
                {todos.length === 0 ? (
                  <>
                    <ListTodo className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-muted-foreground text-sm">No tasks yet. Add one above.</p>
                  </>
                ) : (
                  <>
                    <Circle className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-muted-foreground text-sm">No matches for this filter.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right panel: Calendar */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Calendar controls */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[200px] text-center">{headerLabel}</span>
            <Button variant="ghost" size="sm" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={viewMode === 'week' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('week')}
            >
              Week
            </Button>
            <Button
              variant={viewMode === 'month' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('month')}
            >
              Month
            </Button>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="rounded-lg border border-white/10 overflow-hidden flex-1 flex flex-col min-h-0">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-white/10">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div
                key={d}
                className="px-2 py-1.5 text-xs text-muted-foreground text-center font-medium"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div
            className={cn(
              'grid grid-cols-7 flex-1 overflow-y-auto scrollbar-thin',
              viewMode === 'month' && 'grid-rows-6'
            )}
          >
            {days.map((date) => {
              const dateStr = toDateKey(date);
              const dayTodos = todosForDay(date);
              const isToday = dateStr === today;
              const inMonth = viewMode === 'week' || isCurrentMonth(date);

              return (
                <div
                  key={dateStr}
                  className={cn(
                    'border-b border-r border-white/5 p-1',
                    viewMode === 'week' ? 'min-h-[180px]' : 'min-h-0',
                    !inMonth && 'opacity-40'
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, dateStr)}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className={cn(
                        'text-xs px-1.5 py-0.5 rounded-full',
                        isToday ? 'bg-lime-500 text-black font-bold' : 'text-muted-foreground'
                      )}
                    >
                      {date.getDate()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAdd(showAdd === dateStr ? null : dateStr)}
                      className="opacity-0 hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-0.5"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Inline add */}
                  {showAdd === dateStr && (
                    <div className="mb-1 space-y-1">
                      <input
                        autoFocus
                        value={addForm.title}
                        onChange={(e) => setAddForm((p) => ({ ...p, title: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddToCalendar(dateStr);
                          if (e.key === 'Escape') setShowAdd(null);
                        }}
                        placeholder="Task..."
                        className="w-full rounded border border-white/10 bg-card px-1.5 py-1 text-[11px] outline-none focus:border-lime-500/50"
                      />
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1 text-[10px]"
                          onClick={() => handleAddToCalendar(dateStr)}
                          disabled={adding}
                        >
                          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1 text-[10px]"
                          onClick={() => setShowAdd(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Task pills */}
                  <div className="space-y-0.5">
                    {dayTodos.map((todo) => (
                      <div
                        key={todo.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, todo.id)}
                        className={cn(
                          'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] cursor-grab active:cursor-grabbing border',
                          todo.completed
                            ? 'border-white/5 opacity-50 line-through'
                            : PRIORITY_COLORS[todo.priority] || PRIORITY_COLORS.medium
                        )}
                      >
                        <Checkbox
                          checked={todo.completed}
                          onChange={() => handleToggle(todo.id, !todo.completed)}
                          className="h-3 w-3"
                        />
                        <span className="truncate">{todo.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Unscheduled tasks */}
        {unscheduled.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-card p-3 mt-3 shrink-0">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Unscheduled ({unscheduled.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {unscheduled.map((todo) => (
                <div
                  key={todo.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, todo.id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs cursor-grab border ${
                    PRIORITY_COLORS[todo.priority] || PRIORITY_COLORS.medium
                  }`}
                >
                  <span>{todo.title}</span>
                  {todo.jobTitle && (
                    <Badge variant="outline" className="text-[9px] h-4">
                      {todo.jobTitle}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
