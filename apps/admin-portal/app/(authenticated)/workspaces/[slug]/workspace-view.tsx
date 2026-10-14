'use client';

import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  FileDown,
  ListOrdered,
  Merge,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFeatureEnabled } from '@/components/demo/demo-features';
import { useHeaderSlot } from '@/components/layout/header-context';
import { FindingsPanel } from '@/components/research/findings-panel';
import { ResearchToolbar } from '@/components/research/research-toolbar';
import { SourcesPanel } from '@/components/research/sources-panel';
import { toastAiRefusal } from '@/lib/ai/refusal-toast';
import type { GapFinding } from '@/lib/db/schema';
import {
  parseMarkdownToCards,
  parseMarkdownToChecklist,
  parseMarkdownToKvPairs,
  parseMarkdownToTable,
} from '@/lib/workspaces/parse-structured';
import {
  buildSectionTree,
  computeSectionNumbers,
  getDescendantCount,
  MAX_SECTION_DEPTH,
} from '@/lib/workspaces/section-tree';
import type {
  AllSectionItem,
  SectionTreeNode,
  SectionVersion,
  SectionWithContent,
  WorkspaceDetail,
} from '@/lib/workspaces/types';
import { GapPanel, type GapPanelHandle } from './gap-panel';
import { OrganiseDialog } from './organise-dialog';
import { SectionNav, useActiveSectionId } from './section-nav';
import { AddSectionDialog } from './sections/add-section-dialog';
import { MergeDialog } from './sections/merge-dialog';
import { MoveToDialog } from './sections/move-to-dialog';
import { SectionRenderer } from './sections/section-renderer';
import { VersionDiff } from './sections/version-diff';
import { TypographyButton } from './typography-panel';

interface GapFixPreview {
  sectionId: number;
  sectionTitle: string;
  oldContent: string;
  newContent: string;
  suggestion: string;
}

function getCollapsedSections(): Record<number, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('collapsed-sections') ?? '{}');
  } catch {
    return {};
  }
}

function setCollapsedSections(state: Record<number, boolean>) {
  localStorage.setItem('collapsed-sections', JSON.stringify(state));
}

interface WorkspaceViewProps {
  workspace: WorkspaceDetail;
  initialGapFindings: GapFinding[] | null;
  lastAnalysedAt?: string | null;
  allSections?: AllSectionItem[];
}

export function WorkspaceView({
  workspace,
  initialGapFindings,
  lastAnalysedAt: initialLastAnalysedAt,
  allSections,
}: WorkspaceViewProps) {
  const router = useRouter();
  const [sections, setSections] = useState<SectionWithContent[]>(workspace.sections);

  // Sync sections from server props when router.refresh() re-renders the server component
  useEffect(() => {
    setSections(workspace.sections);
  }, [workspace.sections]);
  const [showAddSection, setShowAddSection] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [showOrganise, setShowOrganise] = useState(false);
  const [findings, setFindings] = useState<GapFinding[] | null>(initialGapFindings);
  const [lastAnalysedAt, setLastAnalysedAt] = useState<string | null>(
    initialLastAnalysedAt ?? null
  );
  const [collapseKey, setCollapseKey] = useState(0);
  const gapPanelRef = useRef<GapPanelHandle>(null);

  // Research workspace state
  // Research agents are switched off in the demo
  const researchEnabled = useFeatureEnabled('research');
  const isResearch = workspace.category === 'research' && researchEnabled;
  const [showFindings, setShowFindings] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [sourceCount, setSourceCount] = useState(0);
  const [findingCount, setFindingCount] = useState(0);

  // Fetch research counts and refresh page when agent runs complete
  const refreshResearchCounts = useCallback(() => {
    if (!isResearch) return;
    Promise.all([
      fetch(`/api/workspaces/${workspace.id}/research/sources`).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(`/api/workspaces/${workspace.id}/research/findings`).then((r) =>
        r.ok ? r.json() : null
      ),
    ]).then(([sourcesData, findingsData]) => {
      if (sourcesData) setSourceCount((sourcesData.sources ?? sourcesData ?? []).length);
      if (findingsData) setFindingCount((findingsData.findings ?? findingsData ?? []).length);
    });
    // Refresh the server component to pick up section content changes from analysis agent
    router.refresh();
  }, [isResearch, workspace.id, router]);

  useEffect(() => {
    refreshResearchCounts();
  }, [refreshResearchCounts]);

  // Workspace rename state
  const [wsTitle, setWsTitle] = useState(workspace.title);
  const [wsDescription, setWsDescription] = useState(workspace.description ?? '');
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [renamingDesc, setRenamingDesc] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLInputElement>(null);

  const handleRenameWorkspace = useCallback(
    async (field: 'title' | 'description', value: string) => {
      const trimmed = value.trim();
      if (field === 'title' && (!trimmed || trimmed === workspace.title)) {
        setWsTitle(workspace.title);
        return;
      }
      if (field === 'description' && trimmed === (workspace.description ?? '')) {
        setWsDescription(workspace.description ?? '');
        return;
      }
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: trimmed }),
      });
      if (!res.ok) {
        if (field === 'title') setWsTitle(workspace.title);
        else setWsDescription(workspace.description ?? '');
      }
    },
    [workspace.id, workspace.title, workspace.description]
  );

  useEffect(() => {
    if (renamingTitle) titleInputRef.current?.select();
  }, [renamingTitle]);

  useEffect(() => {
    if (renamingDesc) descInputRef.current?.select();
  }, [renamingDesc]);

  // Compute findings grouped by section for inline gap indicators
  const findingsBySection = useMemo(() => {
    const map = new Map<number, GapFinding[]>();
    if (!findings) return map;
    for (const f of findings) {
      const existing = map.get(f.sectionId) ?? [];
      existing.push(f);
      map.set(f.sectionId, existing);
    }
    return map;
  }, [findings]);

  // Only rebuild the tree when structural properties change (not content edits)
  const treeKey = useMemo(
    () =>
      sections
        .map(
          (s) =>
            `${s.id}:${s.parentSectionId}:${s.sortOrder}:${s.template}:${s.title}:${s.latestVersion?.version ?? 0}`
        )
        .join(','),
    [sections]
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: treeKey tracks structural + content changes
  const sectionTree = useMemo(() => buildSectionTree(sections), [treeKey]);
  const activeId = useActiveSectionId(sections);

  // Section numbering
  const [showNumbering, setShowNumbering] = useState(
    () => !!(workspace.metadata as Record<string, unknown> | null)?.showNumbering
  );
  const numberingMap = useMemo(
    () => (showNumbering ? computeSectionNumbers(sectionTree) : new Map<number, string>()),
    [showNumbering, sectionTree]
  );

  const toggleNumbering = useCallback(async () => {
    const next = !showNumbering;
    setShowNumbering(next);
    await fetch(`/api/workspaces/${workspace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { showNumbering: next } }),
    });
  }, [showNumbering, workspace.id]);

  const [allCollapsed, setAllCollapsed] = useState(false);

  useEffect(() => {
    const state = getCollapsedSections();
    setAllCollapsed(sections.length > 0 && sections.every((s) => state[s.id]));
  }, [sections]);

  // Clean up collapsed-sections localStorage for deleted sections
  useEffect(() => {
    const state = getCollapsedSections();
    const validIds = new Set(sections.map((s) => s.id));
    const pruned: Record<number, boolean> = {};
    for (const [key, value] of Object.entries(state)) {
      if (validIds.has(Number(key))) {
        pruned[Number(key)] = value;
      }
    }
    if (Object.keys(pruned).length < Object.keys(state).length) {
      setCollapsedSections(pruned);
    }
  }, [sections]);

  const toggleAllCollapsed = useCallback(() => {
    const state = getCollapsedSections();
    const shouldCollapse = !allCollapsed;
    for (const s of sections) {
      state[s.id] = shouldCollapse;
    }
    setCollapsedSections(state);
    setCollapseKey((k) => k + 1);
  }, [sections, allCollapsed]);

  const handleSave = useCallback(
    async (
      sectionId: number,
      data: { content?: string; structuredData?: Record<string, unknown> },
      changeDescription?: string,
      changeSource?: string
    ) => {
      const res = await fetch(`/api/workspaces/${workspace.id}/sections/${sectionId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          changeDescription: changeDescription || 'Manual edit',
          changeSource: changeSource || 'manual',
        }),
      });

      if (!res.ok) return;

      const newVersion: SectionVersion = await res.json();
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, latestVersion: newVersion } : s))
      );
    },
    [workspace.id]
  );

  const handleVersionRestore = useCallback((sectionId: number, restoredVersion: SectionVersion) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, latestVersion: restoredVersion } : s))
    );
  }, []);

  const handleUpdateSection = useCallback(
    async (sectionId: number, updates: Record<string, unknown>) => {
      const res = await fetch(`/api/workspaces/${workspace.id}/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, ...updated, latestVersion: s.latestVersion, sources: s.sources }
            : s
        )
      );
    },
    [workspace.id]
  );

  const refreshDependencies = useCallback(
    async (sectionId: number) => {
      const res = await fetch(`/api/workspaces/${workspace.id}/sections/${sectionId}/dependencies`);
      if (!res.ok) return;
      const { dependencies, dependents } = await res.json();
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, dependencies, dependents } : s))
      );
    },
    [workspace.id]
  );

  const handleAddDependency = useCallback(
    async (
      sectionId: number,
      body: { dependsOnSectionId: number; relationType: string; description?: string }
    ) => {
      const res = await fetch(
        `/api/workspaces/${workspace.id}/sections/${sectionId}/dependencies`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add dependency');
      }
      await refreshDependencies(sectionId);
    },
    [workspace.id, refreshDependencies]
  );

  const handleRemoveDependency = useCallback(
    async (sectionId: number, depId: number) => {
      const res = await fetch(
        `/api/workspaces/${workspace.id}/sections/${sectionId}/dependencies/${depId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) return;
      await refreshDependencies(sectionId);
    },
    [workspace.id, refreshDependencies]
  );

  const [addSectionParent, setAddSectionParent] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [addSectionPosition, setAddSectionPosition] = useState<{
    relativeTo: number;
    placement: 'above' | 'below';
  } | null>(null);

  const handleAddSection = useCallback(
    async (data: {
      title: string;
      slug: string;
      template: string;
      description?: string;
      parentSectionId?: number | null;
    }) => {
      // If inserting relative to a section, calculate sortOrder
      let sortOrder: number | undefined;
      if (addSectionPosition) {
        const ref = sections.find((s) => s.id === addSectionPosition.relativeTo);
        if (ref) {
          const parentId = data.parentSectionId ?? null;
          const siblings = sections.filter((s) => (s.parentSectionId ?? null) === parentId);
          siblings.sort((a, b) => a.sortOrder - b.sortOrder);
          const refIdx = siblings.findIndex((s) => s.id === ref.id);
          if (addSectionPosition.placement === 'above') {
            sortOrder = refIdx >= 0 ? ref.sortOrder : 0;
          } else {
            sortOrder = refIdx >= 0 ? ref.sortOrder + 1 : siblings.length;
          }
        }
      }

      const res = await fetch(`/api/workspaces/${workspace.id}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, ...(sortOrder !== undefined ? { sortOrder } : {}) }),
      });
      if (!res.ok) return;
      const created = await res.json();
      setSections((prev) => [
        ...prev,
        { ...created, sources: [], dependencies: [], dependents: [] },
      ]);
      setShowAddSection(false);
      setAddSectionParent(null);
      setAddSectionPosition(null);
    },
    [workspace.id, sections, addSectionPosition]
  );

  const handleAddChildSection = useCallback((parentId: number, parentTitle: string) => {
    setAddSectionParent({ id: parentId, title: parentTitle });
    setAddSectionPosition(null);
    setShowAddSection(true);
  }, []);

  const handleAddSectionRelative = useCallback(
    (sectionId: number, placement: 'above' | 'below') => {
      const section = sections.find((s) => s.id === sectionId);
      if (!section) return;
      // New section gets same parent as the reference section
      if (section.parentSectionId) {
        const parent = sections.find((s) => s.id === section.parentSectionId);
        setAddSectionParent(parent ? { id: parent.id, title: parent.title } : null);
      } else {
        setAddSectionParent(null);
      }
      setAddSectionPosition({ relativeTo: sectionId, placement });
      setShowAddSection(true);
    },
    [sections]
  );

  const handleExtractChild = useCallback(
    async (sectionId: number, selectedText: string) => {
      const res = await fetch(
        `/api/workspaces/${workspace.id}/sections/${sectionId}/extract-child`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedText }),
        }
      );
      if (!res.ok) return;
      const data = await res.json();
      setSections((prev) => {
        const updated = prev.map((s) =>
          s.id === sectionId ? { ...s, latestVersion: data.original.latestVersion } : s
        );
        return [
          ...updated,
          {
            ...data.childSection,
            sources: [],
            dependencies: [],
            dependents: [],
          },
        ];
      });
    },
    [workspace.id]
  );

  const handleDeleteSection = useCallback(
    async (sectionId: number) => {
      const res = await fetch(`/api/workspaces/${workspace.id}/sections/${sectionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) return;
      // Remove section and all descendants (cascade delete on server)
      const getDescendantIds = (id: number, all: SectionWithContent[]): number[] => {
        const children = all.filter((s) => s.parentSectionId === id);
        return [id, ...children.flatMap((c) => getDescendantIds(c.id, all))];
      };
      const idsToRemove = new Set(getDescendantIds(sectionId, sections));
      setSections((prev) => prev.filter((s) => !idsToRemove.has(s.id)));
    },
    [workspace.id, sections]
  );

  const handleMoveSection = useCallback(
    async (sectionId: number, direction: 'up' | 'down') => {
      const section = sections.find((s) => s.id === sectionId);
      if (!section) return;
      const parentId = section.parentSectionId ?? null;
      const siblings = sections
        .filter((s) => (s.parentSectionId ?? null) === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = siblings.findIndex((s) => s.id === sectionId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return;

      const target = siblings[swapIdx]!;
      // Swap sort orders
      const updates = [
        { id: sectionId, sortOrder: target.sortOrder },
        { id: target.id, sortOrder: section.sortOrder },
      ];

      // Save previous state for rollback
      const prevSections = [...sections];

      // Optimistic update
      setSections((prev) =>
        prev.map((s) => {
          const u = updates.find((x) => x.id === s.id);
          return u ? { ...s, sortOrder: u.sortOrder } : s;
        })
      );

      // Persist both — rollback on failure
      try {
        const results = await Promise.all(
          updates.map((u) =>
            fetch(`/api/workspaces/${workspace.id}/sections/${u.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sortOrder: u.sortOrder }),
            })
          )
        );
        if (results.some((r) => !r.ok)) {
          setSections(prevSections);
        }
      } catch {
        setSections(prevSections);
      }
    },
    [workspace.id, sections]
  );

  const handlePromoteToRoot = useCallback(
    async (sectionId: number) => {
      const res = await fetch(`/api/workspaces/${workspace.id}/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentSectionId: null }),
      });
      if (!res.ok) return;
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, parentSectionId: null } : s))
      );
    },
    [workspace.id]
  );

  // Move-to dialog state
  const [moveToSection, setMoveToSection] = useState<{
    id: number;
    title: string;
    depth: number;
  } | null>(null);

  const handleMoveToParent = useCallback(
    async (sectionId: number, newParentId: number | null) => {
      const res = await fetch(`/api/workspaces/${workspace.id}/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentSectionId: newParentId }),
      });
      if (!res.ok) return;
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, parentSectionId: newParentId } : s))
      );
    },
    [workspace.id]
  );

  const [gapFixPreview, setGapFixPreview] = useState<GapFixPreview | null>(null);
  const [gapFixLoading, setGapFixLoading] = useState<number | null>(null);

  const handleFixWithAi = useCallback(
    async (sectionId: number, suggestion: string) => {
      const section = sections.find((s) => s.id === sectionId);
      if (!section) return;

      setGapFixLoading(sectionId);
      const fullContent = section.latestVersion?.content ?? '';

      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/sections/${sectionId}/ai-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedText: fullContent || undefined,
            fullContent: fullContent || undefined,
            action: 'custom',
            customPrompt: `Improve this section based on the following gap analysis finding: ${suggestion}`,
          }),
        });

        if (!res.ok) {
          await toastAiRefusal(res);
          return;
        }

        const data = await res.json();

        setGapFixPreview({
          sectionId,
          sectionTitle: section.title,
          oldContent: fullContent,
          newContent: data.modifiedContent,
          suggestion,
        });
      } finally {
        setGapFixLoading(null);
      }
    },
    [sections, workspace.id]
  );

  const handleFixWithPrompt = useCallback(
    async (sectionId: number, suggestion: string, customPrompt: string) => {
      const section = sections.find((s) => s.id === sectionId);
      if (!section) return;

      setGapFixLoading(sectionId);
      const fullContent = section.latestVersion?.content ?? '';

      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/sections/${sectionId}/ai-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedText: fullContent || undefined,
            fullContent: fullContent || undefined,
            action: 'custom',
            customPrompt: `Improve this section based on the following gap analysis finding: ${suggestion}\n\nAdditional instructions: ${customPrompt}`,
          }),
        });

        if (!res.ok) {
          await toastAiRefusal(res);
          return;
        }

        const data = await res.json();

        setGapFixPreview({
          sectionId,
          sectionTitle: section.title,
          oldContent: fullContent,
          newContent: data.modifiedContent,
          suggestion,
        });
      } finally {
        setGapFixLoading(null);
      }
    },
    [sections, workspace.id]
  );

  const handleAcceptGapFix = useCallback(async () => {
    if (!gapFixPreview) return;

    const section = sections.find((s) => s.id === gapFixPreview.sectionId);
    const template = section?.template ?? 'prose';
    const markdown = gapFixPreview.newContent;

    let saveData: { content?: string; structuredData?: Record<string, unknown> };

    switch (template) {
      case 'cards': {
        const structured = parseMarkdownToCards(markdown);
        saveData = { content: markdown, structuredData: structured };
        break;
      }
      case 'table': {
        const structured = parseMarkdownToTable(markdown);
        saveData = { content: markdown, structuredData: structured };
        break;
      }
      case 'checklist': {
        const structured = parseMarkdownToChecklist(markdown);
        saveData = { content: markdown, structuredData: structured };
        break;
      }
      case 'kv-pairs': {
        const structured = parseMarkdownToKvPairs(markdown);
        saveData = { content: markdown, structuredData: structured };
        break;
      }
      default:
        saveData = { content: markdown };
    }

    await handleSave(
      gapFixPreview.sectionId,
      saveData,
      `AI gap fix: ${gapFixPreview.suggestion.slice(0, 60)}`,
      'ai_gap_fill'
    );
    setGapFixPreview(null);

    // Re-run gap analysis to reflect the fix
    gapPanelRef.current?.runAnalysis();
  }, [gapFixPreview, handleSave, sections]);

  const handleRejectGapFix = useCallback(() => {
    setGapFixPreview(null);
  }, []);

  // Callback for GapPanel to update shared findings state
  const handleFindingsChange = useCallback(
    (newFindings: GapFinding[] | null, analysedAt?: string) => {
      setFindings(newFindings);
      if (analysedAt) setLastAnalysedAt(analysedAt);
    },
    []
  );

  const DEPTH_INDENT = ['ml-0', 'ml-4', 'ml-8', 'ml-12', 'ml-16'];

  function renderSectionTree(nodes: SectionTreeNode[], parentTitle?: string) {
    return nodes.map((node, idx) => (
      <div key={`${node.id}-${collapseKey}`}>
        <div id={`section-${node.id}`} className={DEPTH_INDENT[node.depth] ?? 'ml-16'}>
          <SectionRenderer
            section={node}
            workspaceId={workspace.id}
            onSave={handleSave}
            onDelete={handleDeleteSection}
            onUpdateSection={handleUpdateSection}
            allSections={allSections}
            onAddDependency={handleAddDependency}
            onRemoveDependency={handleRemoveDependency}
            gapFindings={findingsBySection.get(node.id)}
            onVersionRestore={handleVersionRestore}
            onSplitComplete={async () => {
              const res = await fetch(`/api/workspaces/${workspace.id}/sections`);
              if (res.ok) {
                const data = await res.json();
                setSections(data);
              }
            }}
            sectionNumber={numberingMap.get(node.id)}
            depth={node.depth}
            parentTitle={parentTitle}
            onAddChild={
              node.depth < MAX_SECTION_DEPTH
                ? () => handleAddChildSection(node.id, node.title)
                : undefined
            }
            onAddSectionAbove={() => handleAddSectionRelative(node.id, 'above')}
            onAddSectionBelow={() => handleAddSectionRelative(node.id, 'below')}
            onMoveUp={idx > 0 ? () => handleMoveSection(node.id, 'up') : undefined}
            onMoveDown={
              idx < nodes.length - 1 ? () => handleMoveSection(node.id, 'down') : undefined
            }
            onPromoteToRoot={
              node.parentSectionId != null ? () => handlePromoteToRoot(node.id) : undefined
            }
            onMoveTo={() => setMoveToSection({ id: node.id, title: node.title, depth: node.depth })}
            onExtractChild={
              node.depth < MAX_SECTION_DEPTH
                ? (selectedText: string) => handleExtractChild(node.id, selectedText)
                : undefined
            }
            childCount={getDescendantCount(node)}
          />
        </div>
        {node.children.length > 0 && (
          <div className="mt-1 space-y-1">{renderSectionTree(node.children, node.title)}</div>
        )}
      </div>
    ));
  }

  const { setSlot } = useHeaderSlot();

  // Push workspace title + toolbar into the global header bar
  useEffect(() => {
    setSlot(
      <WorkspaceHeaderSlot
        wsTitle={wsTitle}
        wsDescription={wsDescription}
        sectionCount={sections.length}
        allCollapsed={allCollapsed}
        onToggleCollapse={toggleAllCollapsed}
        onMerge={() => setShowMerge(true)}
        onOrganise={() => setShowOrganise(true)}
        onExport={() => window.open(`/api/workspaces/${workspace.id}/export/pdf`, '_blank')}
        onRenameTitle={setRenamingTitle}
        onRenameDesc={setRenamingDesc}
        renamingTitle={renamingTitle}
        renamingDesc={renamingDesc}
        titleInputRef={titleInputRef}
        descInputRef={descInputRef}
        onTitleChange={setWsTitle}
        onDescChange={setWsDescription}
        onTitleCommit={() => {
          setRenamingTitle(false);
          handleRenameWorkspace('title', wsTitle);
        }}
        onTitleCancel={() => {
          setWsTitle(workspace.title);
          setRenamingTitle(false);
        }}
        onDescCommit={() => {
          setRenamingDesc(false);
          handleRenameWorkspace('description', wsDescription);
        }}
        onDescCancel={() => {
          setWsDescription(workspace.description ?? '');
          setRenamingDesc(false);
        }}
        showNumbering={showNumbering}
        onToggleNumbering={toggleNumbering}
      />
    );
    return () => setSlot(null);
  }, [
    setSlot,
    wsTitle,
    wsDescription,
    sections.length,
    allCollapsed,
    toggleAllCollapsed,
    renamingTitle,
    renamingDesc,
    handleRenameWorkspace,
    workspace.id,
    workspace.title,
    workspace.description,
    showNumbering,
    toggleNumbering,
  ]);

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Research toolbar — shown only for research workspaces */}
      {isResearch && (
        <div className="shrink-0 pb-2">
          <ResearchToolbar
            workspaceId={workspace.id}
            sourceCount={sourceCount}
            findingCount={findingCount}
            onShowSources={() => setShowSources(true)}
            onShowFindings={() => setShowFindings(true)}
            onShowRuns={() => {}}
            onCountsChanged={refreshResearchCounts}
          />
        </div>
      )}

      {/* Gap panel — fixed at top */}
      <div className="shrink-0 space-y-4 pb-4">
        <GapPanel
          ref={gapPanelRef}
          workspaceId={workspace.id}
          initialFindings={initialGapFindings}
          lastAnalysedAt={lastAnalysedAt}
          hasChanges={
            lastAnalysedAt != null &&
            sections.some((s) => {
              const sectionUpdated = s.latestVersion?.createdAt;
              return sectionUpdated && new Date(sectionUpdated) > new Date(lastAnalysedAt);
            })
          }
          onFixWithAi={handleFixWithAi}
          onFixWithPrompt={handleFixWithPrompt}
          fixingSection={gapFixLoading}
          onFindingsChange={handleFindingsChange}
        />

        {gapFixPreview && (
          <Card className="border-primary/30">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    AI Fix Preview — {gapFixPreview.sectionTitle}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Review the proposed changes before applying
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRejectGapFix}
                    className="h-7 text-xs"
                  >
                    <X size={12} className="mr-1" />
                    Reject
                  </Button>
                  <Button size="sm" onClick={handleAcceptGapFix} className="h-7 text-xs">
                    <Check size={12} className="mr-1" />
                    Accept
                  </Button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin rounded border border-border p-3">
                <VersionDiff
                  oldText={gapFixPreview.oldContent}
                  newText={gapFixPreview.newContent}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sections area — sidebar + scrollable content */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Section navigation sidebar */}
        <SectionNav
          sectionTree={sectionTree}
          findingsBySection={findingsBySection}
          activeId={activeId}
          numberingMap={numberingMap}
        />

        {/* Main content — scrolls independently */}
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin space-y-1 pr-1">
          {renderSectionTree(sectionTree)}

          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={() => {
              setAddSectionParent(null);
              setShowAddSection(true);
            }}
          >
            <Plus size={16} className="mr-2" />
            Add Section
          </Button>
        </div>
      </div>

      {showAddSection && (
        <AddSectionDialog
          onAdd={handleAddSection}
          onClose={() => {
            setShowAddSection(false);
            setAddSectionParent(null);
            setAddSectionPosition(null);
          }}
          parentSectionId={addSectionParent?.id ?? null}
          parentTitle={addSectionParent?.title}
        />
      )}

      {showMerge && (
        <MergeDialog
          sections={sections}
          workspaceId={workspace.id}
          onClose={() => setShowMerge(false)}
          onMerged={() => {
            setShowMerge(false);
            window.location.reload();
          }}
        />
      )}

      {showOrganise && (
        <OrganiseDialog workspaceId={workspace.id} onClose={() => setShowOrganise(false)} />
      )}

      {moveToSection && (
        <MoveToDialog
          sectionId={moveToSection.id}
          sectionTitle={moveToSection.title}
          sectionDepth={moveToSection.depth}
          subtreeDepth={0}
          sectionTree={sectionTree}
          onMove={(targetParentId) => handleMoveToParent(moveToSection.id, targetParentId)}
          onClose={() => setMoveToSection(null)}
        />
      )}

      {/* Research panels & chat — only for research workspaces */}
      {isResearch && (
        <>
          <FindingsPanel
            workspaceId={workspace.id}
            open={showFindings}
            onClose={() => setShowFindings(false)}
          />
          <SourcesPanel
            workspaceId={workspace.id}
            open={showSources}
            onClose={() => setShowSources(false)}
            onSourceCountChange={setSourceCount}
          />
        </>
      )}
    </div>
  );
}

/** Renders the workspace title + toolbar inside the global header bar. */
function WorkspaceHeaderSlot({
  wsTitle,
  wsDescription,
  sectionCount,
  allCollapsed,
  onToggleCollapse,
  onMerge,
  onOrganise,
  onExport,
  onRenameTitle,
  onRenameDesc,
  renamingTitle,
  renamingDesc,
  titleInputRef,
  descInputRef,
  onTitleChange,
  onDescChange,
  onTitleCommit,
  onTitleCancel,
  onDescCommit,
  onDescCancel,
  showNumbering,
  onToggleNumbering,
}: {
  wsTitle: string;
  wsDescription: string;
  sectionCount: number;
  allCollapsed: boolean;
  onToggleCollapse: () => void;
  onMerge: () => void;
  onOrganise: () => void;
  onExport: () => void;
  onRenameTitle: (v: boolean) => void;
  onRenameDesc: (v: boolean) => void;
  renamingTitle: boolean;
  renamingDesc: boolean;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  descInputRef: React.RefObject<HTMLInputElement | null>;
  onTitleChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onTitleCommit: () => void;
  onTitleCancel: () => void;
  onDescCommit: () => void;
  onDescCancel: () => void;
  showNumbering: boolean;
  onToggleNumbering: () => void;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {/* Title (editable on double-click) */}
      <div className="min-w-0 shrink">
        {renamingTitle ? (
          <input
            ref={titleInputRef}
            value={wsTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={onTitleCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onTitleCommit();
              if (e.key === 'Escape') onTitleCancel();
            }}
            className="text-sm font-medium bg-transparent border border-border rounded px-1.5 py-0.5 outline-none focus:border-foreground/40 w-full"
          />
        ) : (
          <span
            className="text-sm font-medium truncate block cursor-pointer hover:text-foreground/80"
            onDoubleClick={() => onRenameTitle(true)}
            title={`${wsTitle}${wsDescription ? ` — ${wsDescription}` : ''}\nDouble-click to rename`}
          >
            {wsTitle}
          </span>
        )}
      </div>

      {/* Description (inline, subtle) */}
      {renamingDesc ? (
        <input
          ref={descInputRef}
          value={wsDescription}
          onChange={(e) => onDescChange(e.target.value)}
          onBlur={onDescCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onDescCommit();
            if (e.key === 'Escape') onDescCancel();
          }}
          placeholder="Add a description..."
          className="text-xs text-muted-foreground bg-transparent border border-border rounded px-1.5 py-0.5 outline-none focus:border-foreground/40 flex-1 min-w-0"
        />
      ) : wsDescription ? (
        <span
          className="text-xs text-muted-foreground/50 truncate hidden lg:block cursor-pointer hover:text-muted-foreground/70 max-w-48"
          onDoubleClick={() => onRenameDesc(true)}
          title={`${wsDescription}\nDouble-click to edit`}
        >
          {wsDescription}
        </span>
      ) : null}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Toolbar buttons (icon-only to fit header) */}
      <div className="flex items-center shrink-0">
        {sectionCount >= 2 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMerge}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Merge sections"
          >
            <Merge size={14} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onOrganise}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          title="AI auto-organise"
        >
          <Sparkles size={14} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleNumbering}
          className={`h-7 w-7 p-0 ${showNumbering ? 'text-primary' : 'text-muted-foreground'} hover:text-foreground`}
          title={showNumbering ? 'Hide section numbering' : 'Show section numbering'}
        >
          <ListOrdered size={14} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onExport}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          title="Export as PDF"
        >
          <FileDown size={14} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          title={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
        >
          {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
        </Button>
        <TypographyButton />
      </div>
    </div>
  );
}
