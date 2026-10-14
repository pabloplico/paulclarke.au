'use client';

import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CornerLeftUp,
  Expand,
  FolderInput,
  MessageSquare,
  Minimize2,
  MoveDown,
  MoveUp,
  Pencil,
  PenLine,
  Plus,
  Scissors,
  Search,
  Sparkles,
  Tags,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ContextMenu,
  type ContextMenuEntry,
  type ContextMenuItem,
} from '@/components/ui/context-menu';
import { toastAiRefusal } from '@/lib/ai/refusal-toast';
import type { CompletenessRule, GapFinding } from '@/lib/db/schema';
import type { AllSectionItem, SectionVersion, SectionWithContent } from '@/lib/workspaces/types';
import { AiEditPreview } from './ai-edit-preview';
import { type AiEditAction, AiEditToolbar } from './ai-edit-toolbar';
import { CardsSection } from './cards-section';
import { ChecklistSection } from './checklist-section';
import { DependenciesDialog } from './dependencies-dialog';
import { KvSection } from './kv-section';
import { ProseSection } from './prose-section';
import { RulesEditorDialog } from './rules-editor-dialog';
import { SectionHeader } from './section-header';
import { type SourceResult, SourceResultsPanel } from './source-results-panel';
import { SplitDialog } from './split-dialog';
import { TableSection } from './table-section';
import { TopicPillPreview } from './topic-pill-preview';
import { VersionPanel } from './version-panel';

const AI_ACTIONS: {
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

type InlinePanel = 'rules' | 'deps' | 'history' | 'split' | null;

interface SectionRendererProps {
  section: SectionWithContent;
  workspaceId: number;
  onSave: (
    sectionId: number,
    data: { content?: string; structuredData?: Record<string, unknown> },
    changeDescription?: string,
    changeSource?: string
  ) => Promise<void>;
  onDelete?: (sectionId: number) => Promise<void>;
  onUpdateSection?: (sectionId: number, updates: Record<string, unknown>) => Promise<void>;
  allSections?: AllSectionItem[];
  onAddDependency?: (
    sectionId: number,
    body: { dependsOnSectionId: number; relationType: string; description?: string }
  ) => Promise<void>;
  onRemoveDependency?: (sectionId: number, depId: number) => Promise<void>;
  gapFindings?: GapFinding[];
  onVersionRestore?: (sectionId: number, restoredVersion: SectionVersion) => void;
  onSplitComplete?: () => void;
  depth?: number;
  parentTitle?: string;
  onAddChild?: () => void;
  onAddSectionAbove?: () => void;
  onAddSectionBelow?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onPromoteToRoot?: () => void;
  onMoveTo?: () => void;
  onExtractChild?: (selectedText: string) => void;
  childCount?: number;
  sectionNumber?: string;
}

function getCollapsedState(): Record<number, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('collapsed-sections') ?? '{}');
  } catch {
    return {};
  }
}

function setCollapsedState(state: Record<number, boolean>) {
  localStorage.setItem('collapsed-sections', JSON.stringify(state));
}

export function SectionRenderer({
  section,
  workspaceId,
  onSave,
  onDelete,
  onUpdateSection,
  allSections,
  onAddDependency,
  onRemoveDependency,
  gapFindings,
  onVersionRestore,
  onSplitComplete,
  depth = 0,
  parentTitle,
  onAddChild,
  onAddSectionAbove,
  onAddSectionBelow,
  onMoveUp,
  onMoveDown,
  onPromoteToRoot,
  onMoveTo,
  onExtractChild,
  childCount = 0,
  sectionNumber,
}: SectionRendererProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const stored = getCollapsedState()[section.id];
    if (stored) setIsCollapsed(true);
  }, [section.id]);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      const state = getCollapsedState();
      state[section.id] = next;
      setCollapsedState(state);
      return next;
    });
  }, [section.id]);
  const [saving, setSaving] = useState(false);
  const [inlinePanel, setInlinePanel] = useState<InlinePanel>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // AI edit state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState<{
    originalContent: string;
    modifiedContent: string;
    action: string;
    fullSection: boolean;
  } | null>(null);

  // Full-section AI menu state
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [aiCustomPrompt, setAiCustomPrompt] = useState('');
  const [showAiCustomInput, setShowAiCustomInput] = useState(false);
  const aiCustomInputRef = useRef<HTMLInputElement>(null);

  // Topic analysis state
  const [topicPreview, setTopicPreview] = useState<string[] | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);

  // Find source state
  const [sourceResults, setSourceResults] = useState<{
    query: string;
    sources: SourceResult[];
  } | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const content = section.latestVersion?.content ?? '';
  const structuredData = section.latestVersion?.structuredData as Record<string, unknown> | null;
  // Use version number as key to force remount when data changes externally (e.g., AI fix accepted)
  const versionKey = section.latestVersion?.version ?? 0;

  const handleSave = async (
    data: { content?: string; structuredData?: Record<string, unknown> },
    changeDescription?: string
  ) => {
    setSaving(true);
    try {
      await onSave(section.id, data, changeDescription);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleFindSource = useCallback(async (text: string) => {
    setSourceLoading(true);
    setSourceResults({ query: text.slice(0, 100), sources: [] });
    try {
      const res = await fetch('/api/find-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const data = await res.json();
        setSourceResults({ query: data.query, sources: data.sources });
      } else {
        setSourceResults(null);
      }
    } catch {
      setSourceResults(null);
    } finally {
      setSourceLoading(false);
    }
  }, []);

  const handleSearchOnline = useCallback((text: string) => {
    const query = encodeURIComponent(text.slice(0, 200));
    window.open(`https://www.google.com/search?q=${query}`, '_blank');
  }, []);

  const handleAiAction = useCallback(
    async (
      action: AiEditAction,
      selectedText: string,
      customPrompt?: string,
      fullSection = false
    ) => {
      const fullContent = section.latestVersion?.content ?? '';

      if (action === 'find_source') {
        handleFindSource(selectedText);
        return;
      }

      if (action === 'analyse') {
        setTopicLoading(true);
        setTopicPreview([]);
        try {
          const res = await fetch(`/api/workspaces/${workspaceId}/sections/${section.id}/ai-edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              selectedText: fullSection ? fullContent : selectedText,
              action,
            }),
          });
          if (!res.ok) {
            await toastAiRefusal(res);
            setTopicPreview(null);
            return;
          }
          const data = await res.json();
          setTopicPreview(data.topics);
        } catch {
          setTopicPreview(null);
        } finally {
          setTopicLoading(false);
        }
        return;
      }

      setAiLoading(true);
      setAiPreview({ originalContent: fullContent, modifiedContent: '', action, fullSection });

      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/sections/${section.id}/ai-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedText: fullSection ? fullContent : selectedText,
            fullContent,
            fullSection,
            action,
            customPrompt,
          }),
        });

        if (!res.ok) {
          await toastAiRefusal(res);
          setAiPreview(null);
          return;
        }

        const data = await res.json();
        setAiPreview({
          originalContent: fullContent,
          modifiedContent: data.modifiedContent,
          action,
          fullSection,
        });
      } catch {
        setAiPreview(null);
      } finally {
        setAiLoading(false);
      }
    },
    [workspaceId, section.id, section.latestVersion?.content, handleFindSource]
  );

  const handleAcceptAiEdit = useCallback(async () => {
    if (!aiPreview) return;
    setSaving(true);
    try {
      await onSave(
        section.id,
        { content: aiPreview.modifiedContent },
        `AI ${aiPreview.action}`,
        'ai_edit'
      );
      setAiPreview(null);
    } finally {
      setSaving(false);
    }
  }, [aiPreview, onSave, section.id]);

  const handleRejectAiEdit = useCallback(() => {
    setAiPreview(null);
  }, []);

  const handleAcceptTopics = useCallback(async () => {
    if (!topicPreview || topicPreview.length === 0) return;
    setSaving(true);
    try {
      const existing = (structuredData?.topics as string[] | undefined) ?? [];
      const merged = Array.from(new Set([...existing, ...topicPreview]));
      await onSave(
        section.id,
        { content, structuredData: { ...structuredData, topics: merged } },
        'AI analyse — added topic pills',
        'ai_edit'
      );
      setTopicPreview(null);
    } finally {
      setSaving(false);
    }
  }, [topicPreview, onSave, section.id, content, structuredData]);

  const handleRejectTopics = useCallback(() => {
    setTopicPreview(null);
  }, []);

  const handleSaveRules = useCallback(
    async (rules: CompletenessRule[]) => {
      if (onUpdateSection) {
        await onUpdateSection(section.id, { completenessRules: rules });
      }
      setInlinePanel(null);
    },
    [onUpdateSection, section.id]
  );

  const togglePanel = useCallback((panel: InlinePanel) => {
    setInlinePanel((prev) => (prev === panel ? null : panel));
  }, []);

  const handleFullSectionAction = useCallback(
    (action: AiEditAction) => {
      if (action === 'custom') {
        setShowAiCustomInput(true);
        setTimeout(() => aiCustomInputRef.current?.focus(), 0);
        return;
      }
      setShowAiMenu(false);
      setShowAiCustomInput(false);
      handleAiAction(action, content, undefined, true);
    },
    [handleAiAction, content]
  );

  const handleFullSectionCustomSubmit = useCallback(() => {
    if (!aiCustomPrompt.trim()) return;
    setShowAiMenu(false);
    setShowAiCustomInput(false);
    handleAiAction('custom', content, aiCustomPrompt.trim(), true);
    setAiCustomPrompt('');
  }, [handleAiAction, content, aiCustomPrompt]);

  const contextMenuItems: ContextMenuEntry[] = [
    // ── Edit group ──
    {
      label: isEditing ? 'Cancel Edit' : 'Edit',
      icon: Pencil,
      onClick: isEditing ? () => setIsEditing(false) : () => setIsEditing(true),
    },
    ...(!isEditing
      ? [
          {
            label: 'AI Actions',
            icon: Sparkles,
            onClick: () => setShowAiMenu((prev) => !prev),
          } satisfies ContextMenuItem,
        ]
      : []),
    // ── Structure group ──
    { separator: true } as ContextMenuEntry,
    {
      label: 'Split Section',
      icon: Scissors,
      onClick: () => togglePanel('split'),
    },
    ...(onAddChild
      ? [
          {
            label: 'Add Child Section',
            icon: Plus,
            onClick: onAddChild,
          } satisfies ContextMenuItem,
        ]
      : []),
    ...(onAddSectionAbove
      ? [
          {
            label: 'Add Section Above',
            icon: ArrowUp,
            onClick: onAddSectionAbove,
          } satisfies ContextMenuItem,
        ]
      : []),
    ...(onAddSectionBelow
      ? [
          {
            label: 'Add Section Below',
            icon: ArrowDown,
            onClick: onAddSectionBelow,
          } satisfies ContextMenuItem,
        ]
      : []),
    // ── Move group ──
    ...(onMoveUp || onMoveDown || onPromoteToRoot || onMoveTo
      ? [{ separator: true } as ContextMenuEntry]
      : []),
    ...(onMoveUp
      ? [{ label: 'Move Up', icon: MoveUp, onClick: onMoveUp } satisfies ContextMenuItem]
      : []),
    ...(onMoveDown
      ? [{ label: 'Move Down', icon: MoveDown, onClick: onMoveDown } satisfies ContextMenuItem]
      : []),
    ...(onPromoteToRoot
      ? [
          {
            label: 'Move to Top Level',
            icon: CornerLeftUp,
            onClick: onPromoteToRoot,
          } satisfies ContextMenuItem,
        ]
      : []),
    ...(onMoveTo
      ? [
          {
            label: 'Move to...',
            icon: FolderInput,
            onClick: onMoveTo,
          } satisfies ContextMenuItem,
        ]
      : []),
    // ── Delete group ──
    { separator: true } as ContextMenuEntry,
    ...(onDelete
      ? [
          {
            label:
              childCount > 0
                ? `Delete (+${childCount} child${childCount > 1 ? 'ren' : ''})`
                : 'Delete Section',
            icon: Trash2,
            onClick: () => onDelete(section.id),
            destructive: true,
            confirmMessage:
              childCount > 0
                ? `Delete +${childCount} child${childCount > 1 ? 'ren' : ''}?`
                : 'Delete?',
          } satisfies ContextMenuItem,
        ]
      : []),
  ];

  const sectionCard = (
    <Card>
      <CardContent
        className={isCollapsed ? 'py-2 px-4' : 'py-2 px-4 space-y-4'}
        onContextMenu={handleContextMenu}
      >
        <SectionHeader
          title={section.title}
          template={section.template}
          isEditing={isEditing}
          onEdit={() => setIsEditing(true)}
          onCancelEdit={() => setIsEditing(false)}
          onShowVersions={() => togglePanel('history')}
          onDelete={onDelete ? () => onDelete(section.id) : undefined}
          onAiSelect={
            section.template === 'prose' && !isEditing
              ? () => setShowAiMenu((prev) => !prev)
              : undefined
          }
          onShowRules={() => togglePanel('rules')}
          onShowDependencies={() => togglePanel('deps')}
          dependencyCount={(section.dependencies?.length ?? 0) + (section.dependents?.length ?? 0)}
          staleDependencyCount={section.dependencies?.filter((d) => d.isStale).length ?? 0}
          gapFindings={gapFindings}
          workspaceId={workspaceId}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapsed}
          onSplit={() => togglePanel('split')}
          depth={depth}
          parentTitle={parentTitle}
          onAddChild={onAddChild}
          onAddSectionAbove={onAddSectionAbove}
          onAddSectionBelow={onAddSectionBelow}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onPromoteToRoot={onPromoteToRoot}
          onMoveTo={onMoveTo}
          onChangeTemplate={
            onUpdateSection
              ? (newTemplate) => onUpdateSection(section.id, { template: newTemplate })
              : undefined
          }
          childCount={childCount}
          sectionNumber={sectionNumber}
          description={section.description}
          previewText={
            isCollapsed
              ? (section.latestVersion?.content ?? '').slice(0, 100) || undefined
              : undefined
          }
          onRename={
            onUpdateSection
              ? (newTitle) => onUpdateSection(section.id, { title: newTitle })
              : undefined
          }
          onDescriptionChange={
            onUpdateSection
              ? (newDesc) => onUpdateSection(section.id, { description: newDesc || null })
              : undefined
          }
        />

        {/* Inline panels */}
        {inlinePanel === 'rules' && (
          <RulesEditorDialog
            section={section}
            workspaceId={workspaceId}
            onSave={handleSaveRules}
            onClose={() => setInlinePanel(null)}
          />
        )}

        {inlinePanel === 'deps' && onAddDependency && onRemoveDependency && (
          <DependenciesDialog
            sectionId={section.id}
            sectionTitle={section.title}
            dependencies={section.dependencies ?? []}
            dependents={section.dependents ?? []}
            allSections={allSections ?? []}
            onAdd={(body) => onAddDependency(section.id, body)}
            onRemove={(depId) => onRemoveDependency(section.id, depId)}
            onClose={() => setInlinePanel(null)}
          />
        )}

        {inlinePanel === 'history' && onVersionRestore && (
          <VersionPanel
            workspaceId={workspaceId}
            section={section}
            onClose={() => setInlinePanel(null)}
            onRestore={onVersionRestore}
          />
        )}

        {inlinePanel === 'split' && onSplitComplete && (
          <SplitDialog
            section={section}
            workspaceId={workspaceId}
            onClose={() => setInlinePanel(null)}
            onSplit={onSplitComplete}
          />
        )}

        {!isCollapsed && (
          <>
            {/* Full-section AI action menu */}
            {showAiMenu && !isEditing && (
              <div className="space-y-1">
                <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1">
                  {AI_ACTIONS.map(({ action, label, icon: Icon }) => (
                    <Button
                      key={action}
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFullSectionAction(action)}
                      className="h-7 px-2 text-xs gap-1"
                      aria-label={label}
                    >
                      <Icon size={12} />
                      {label}
                    </Button>
                  ))}
                </div>
                {showAiCustomInput && (
                  <div className="flex gap-1 rounded-lg border border-border bg-popover p-1">
                    <input
                      ref={aiCustomInputRef}
                      value={aiCustomPrompt}
                      onChange={(e) => setAiCustomPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleFullSectionCustomSubmit()}
                      placeholder="Describe what to do with this section..."
                      aria-label="Custom AI edit prompt"
                      className="flex-1 bg-transparent px-2 py-1 text-xs text-foreground focus:outline-none min-w-[200px]"
                    />
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleFullSectionCustomSubmit}
                      disabled={!aiCustomPrompt.trim()}
                      className="h-6 px-2 text-xs"
                    >
                      Go
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Content area with AI toolbar on text selection */}
            <div ref={contentRef} className="relative">
              {!isEditing && section.template === 'prose' && (
                <AiEditToolbar
                  containerRef={contentRef}
                  onAction={handleAiAction}
                  onExtractChild={onExtractChild}
                />
              )}

              {section.template === 'prose' && (
                <ProseSection
                  key={versionKey}
                  content={content}
                  topics={(structuredData?.topics as string[]) ?? []}
                  sources={section.sources}
                  findingSources={section.findingSources}
                  isEditing={isEditing}
                  saving={saving}
                  onSave={handleSave}
                  onEdit={() => setIsEditing(true)}
                />
              )}

              {section.template === 'cards' && (
                <CardsSection
                  key={versionKey}
                  data={structuredData}
                  isEditing={isEditing}
                  saving={saving}
                  onSave={handleSave}
                  onEdit={() => setIsEditing(true)}
                />
              )}

              {section.template === 'table' && (
                <TableSection
                  key={versionKey}
                  data={structuredData}
                  isEditing={isEditing}
                  saving={saving}
                  onSave={handleSave}
                  onEdit={() => setIsEditing(true)}
                />
              )}

              {section.template === 'checklist' && (
                <ChecklistSection
                  key={versionKey}
                  data={structuredData}
                  isEditing={isEditing}
                  saving={saving}
                  onSave={handleSave}
                  onEdit={() => setIsEditing(true)}
                />
              )}

              {section.template === 'kv-pairs' && (
                <KvSection
                  key={versionKey}
                  data={structuredData}
                  isEditing={isEditing}
                  saving={saving}
                  onSave={handleSave}
                  onEdit={() => setIsEditing(true)}
                />
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className={isCollapsed ? '' : 'space-y-3 mb-5'}>
      {/* Side-by-side layout for full-section AI preview, stacked for partial */}
      {aiPreview?.fullSection ? (
        <div className="grid grid-cols-2 gap-3 items-start">
          {sectionCard}
          <AiEditPreview
            originalContent={aiPreview.originalContent}
            modifiedContent={aiPreview.modifiedContent}
            action={aiPreview.action}
            loading={aiLoading}
            onAccept={handleAcceptAiEdit}
            onReject={handleRejectAiEdit}
          />
        </div>
      ) : (
        <>
          {sectionCard}
          {/* AI edit preview for partial selection (shown below the card) */}
          {aiPreview && (
            <AiEditPreview
              originalContent={aiPreview.originalContent}
              modifiedContent={aiPreview.modifiedContent}
              action={aiPreview.action}
              loading={aiLoading}
              onAccept={handleAcceptAiEdit}
              onReject={handleRejectAiEdit}
            />
          )}
        </>
      )}

      {/* Topic analysis preview (shown below the card) */}
      {topicPreview !== null && (
        <TopicPillPreview
          topics={topicPreview}
          loading={topicLoading}
          onAccept={handleAcceptTopics}
          onReject={handleRejectTopics}
        />
      )}

      {/* Find source results (shown below the card) */}
      {(sourceResults || sourceLoading) && (
        <SourceResultsPanel
          query={sourceResults?.query ?? ''}
          sources={sourceResults?.sources ?? []}
          loading={sourceLoading}
          onClose={() => setSourceResults(null)}
          onSearchOnline={handleSearchOnline}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
