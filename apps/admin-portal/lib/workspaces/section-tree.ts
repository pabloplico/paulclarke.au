import type { SectionTreeNode, SectionWithContent } from './types';

/** Maximum nesting depth (0-indexed): root=0, child=1, … so 5 levels in total */
export const MAX_SECTION_DEPTH = 4;

/**
 * Build a tree from a flat array of sections.
 * Root sections (parentSectionId === null) become top-level nodes.
 * Children are sorted by sortOrder within each parent.
 */
export function buildSectionTree(flat: SectionWithContent[]): SectionTreeNode[] {
  const nodeMap = new Map<number, SectionTreeNode>();
  const roots: SectionTreeNode[] = [];

  // Create tree nodes
  for (const section of flat) {
    nodeMap.set(section.id, { ...section, children: [], depth: 0 });
  }

  // Assign children to parents
  for (const node of nodeMap.values()) {
    if (node.parentSectionId != null) {
      const parent = nodeMap.get(node.parentSectionId);
      if (parent) {
        node.depth = parent.depth + 1;
        parent.children.push(node);
      } else {
        // Orphaned — treat as root
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // Fix depths for deeper nesting (parent depth may have been 0 when child was assigned)
  function fixDepths(nodes: SectionTreeNode[], depth: number) {
    for (const node of nodes) {
      node.depth = depth;
      fixDepths(node.children, depth + 1);
    }
  }
  fixDepths(roots, 0);

  // Sort children at each level
  function sortChildren(nodes: SectionTreeNode[]) {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of nodes) {
      sortChildren(node.children);
    }
  }
  sortChildren(roots);

  return roots;
}

/**
 * Recursively count all descendants of a tree node.
 */
export function getDescendantCount(node: SectionTreeNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += getDescendantCount(child);
  }
  return count;
}

/**
 * Flatten a tree back to a flat array in depth-first order.
 */
export function flattenTree(tree: SectionTreeNode[]): SectionWithContent[] {
  const result: SectionWithContent[] = [];
  function walk(nodes: SectionTreeNode[]) {
    for (const node of nodes) {
      result.push(node);
      walk(node.children);
    }
  }
  walk(tree);
  return result;
}

/**
 * Get the depth of a section by tracing ancestors.
 * Returns 0 for root sections, 1 for children, 2 for grandchildren.
 */
export function getDepth(
  sectionId: number | null,
  sections: { id: number; parentSectionId: number | null }[]
): number {
  if (sectionId == null) return 0;
  const byId = new Map(sections.map((s) => [s.id, s]));
  let depth = 0;
  let current = sectionId;
  const visited = new Set<number>();
  while (current != null) {
    if (visited.has(current)) break; // cycle protection
    visited.add(current);
    const section = byId.get(current);
    if (!section?.parentSectionId) break;
    depth++;
    current = section.parentSectionId;
  }
  return depth;
}

/**
 * Get the depth of a potential parent (how deep the parent is + 1 for the new child).
 * Used to validate that adding a child wouldn't exceed MAX_SECTION_DEPTH.
 */
export function getParentDepth(
  parentSectionId: number | null,
  sections: { id: number; parentSectionId: number | null }[]
): number {
  if (parentSectionId == null) return 0;
  return getDepth(parentSectionId, sections) + 1;
}

/**
 * Get the maximum depth of descendants below a given section.
 */
function getMaxDescendantDepth(
  sectionId: number,
  sections: { id: number; parentSectionId: number | null }[]
): number {
  // Build children lookup once: O(n)
  const childrenOf = new Map<number, number[]>();
  for (const s of sections) {
    if (s.parentSectionId != null) {
      let list = childrenOf.get(s.parentSectionId);
      if (!list) {
        list = [];
        childrenOf.set(s.parentSectionId, list);
      }
      list.push(s.id);
    }
  }

  // Recurse using the map: O(k) where k = subtree size
  function maxDepth(id: number): number {
    const kids = childrenOf.get(id);
    if (!kids || kids.length === 0) return 0;
    let max = 0;
    for (const kid of kids) {
      const d = maxDepth(kid);
      if (d > max) max = d;
    }
    return 1 + max;
  }

  return maxDepth(sectionId);
}

/**
 * Compute section numbers for a tree.
 * Root sections: 1.0, 2.0, 3.0
 * Children: 1.1, 1.2, 1.3
 * Grandchildren: 1.1.1, 1.1.2
 * Returns a Map of sectionId → number string.
 */
export function computeSectionNumbers(tree: SectionTreeNode[]): Map<number, string> {
  const numbers = new Map<number, string>();

  function walk(nodes: SectionTreeNode[], prefix: string, depth: number) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      let num: string;
      if (depth === 0) {
        num = `${prefix}${i + 1}.0`;
      } else {
        num = `${prefix}${i + 1}`;
      }
      numbers.set(node.id, num);
      const childPrefix = depth === 0 ? `${i + 1}.` : `${num}.`;
      walk(node.children, childPrefix, depth + 1);
    }
  }

  walk(tree, '', 0);
  return numbers;
}

/**
 * Validate that placing a section (optionally with its subtree) under a parent
 * would not exceed the maximum depth or create a cycle.
 */
export function validateDepth(
  parentSectionId: number | null,
  allSections: { id: number; parentSectionId: number | null }[],
  subtreeRootId?: number
): { valid: boolean; error?: string } {
  // Root-level is always valid
  if (parentSectionId == null) return { valid: true };

  // Build lookup map once for O(1) access by id
  const byId = new Map(allSections.map((s) => [s.id, s]));

  // Cycle check: parent can't be a descendant of the section being moved
  if (subtreeRootId != null) {
    const visited = new Set<number>();
    let current: number | null = parentSectionId;
    while (current != null) {
      if (current === subtreeRootId) {
        return { valid: false, error: 'Cannot move a section under its own descendant' };
      }
      if (visited.has(current)) break;
      visited.add(current);
      const section = byId.get(current);
      current = section?.parentSectionId ?? null;
    }
  }

  // Depth check: parent depth + subtree depth must not exceed MAX_SECTION_DEPTH
  const parentDepth = getParentDepth(parentSectionId, allSections);
  const subtreeDepth =
    subtreeRootId != null ? getMaxDescendantDepth(subtreeRootId, allSections) : 0;

  if (parentDepth + subtreeDepth > MAX_SECTION_DEPTH) {
    return {
      valid: false,
      error: `Maximum nesting depth is ${MAX_SECTION_DEPTH + 1} levels`,
    };
  }

  return { valid: true };
}
