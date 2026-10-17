// Edits to a visitor's taxonomy, as pure functions: each returns a new taxonomy
// that follows the rules taxonomySchema enforces (lower-case names, no self-maps,
// no chains, groups only on canonical names), or an error to show.
import { normaliseSkillName, type SkillGroup, type Taxonomy } from '../../shared/types';

export type TaxonomyEdit = { taxonomy: Taxonomy } | { error: string };

/** The name a skill counts as: its canonical name, or itself. */
export function canonicalOf(taxonomy: Taxonomy, name: string): string {
  const skill = normaliseSkillName(name);
  return taxonomy.canonicalMap[skill] ?? skill;
}

/**
 * Count `from` as `to`: merges two skills ("reactjs" as "react") or renames one
 * ("js" as "javascript"). `to` is followed to its own canonical name, every
 * synonym that pointed at `from` now points there too, and `from`'s groups
 * move to it.
 */
export function countAs(taxonomy: Taxonomy, from: string, to: string): TaxonomyEdit {
  const source = normaliseSkillName(from);
  const target = canonicalOf(taxonomy, to);
  if (!source || !target) return { error: 'Enter both skills.' };
  if (source === target || canonicalOf(taxonomy, source) === target) {
    return { error: `${source} already counts as ${target}.` };
  }

  const canonicalMap: Record<string, string> = {};
  for (const [synonym, canonical] of Object.entries(taxonomy.canonicalMap)) {
    canonicalMap[synonym] = canonical === source ? target : canonical;
  }
  canonicalMap[source] = target;

  const { [source]: movedGroups = [], ...skillGroups } = taxonomy.skillGroups;
  const targetGroups = new Set([...(skillGroups[target] ?? []), ...movedGroups]);
  if (targetGroups.size > 0) skillGroups[target] = [...targetGroups];

  return { taxonomy: { ...taxonomy, canonicalMap, skillGroups } };
}

/** Undo a merge: `synonym` counts as itself again. */
export function stopCountingAs(taxonomy: Taxonomy, synonym: string): Taxonomy {
  const { [normaliseSkillName(synonym)]: _removed, ...canonicalMap } = taxonomy.canonicalMap;
  return { ...taxonomy, canonicalMap };
}

/** Synonyms by the name they count as, alphabetically. */
export function mergesByCanonical(taxonomy: Taxonomy): { canonical: string; synonyms: string[] }[] {
  const byCanonical = new Map<string, string[]>();
  for (const [synonym, canonical] of Object.entries(taxonomy.canonicalMap)) {
    byCanonical.set(canonical, [...(byCanonical.get(canonical) ?? []), synonym]);
  }
  return [...byCanonical]
    .map(([canonical, synonyms]) => ({ canonical, synonyms: synonyms.sort() }))
    .sort((a, b) => a.canonical.localeCompare(b.canonical));
}

const UNNAMED_GROUP_COLOUR = '#6b7280';

/**
 * Every group to show: the named ones, then any id a skill uses that has no name
 * (profiles from before groups were named have only ids).
 */
export function allGroups(taxonomy: Taxonomy): SkillGroup[] {
  const named = new Set(taxonomy.categories.map((group) => group.id));
  const unnamed = [...new Set(Object.values(taxonomy.skillGroups).flat())]
    .filter((id) => !named.has(id))
    .sort()
    .map((id) => ({ id, name: id, color: UNNAMED_GROUP_COLOUR }));
  return [...taxonomy.categories, ...unnamed];
}

/** The canonical skills in a group, alphabetically. */
export function skillsInGroup(taxonomy: Taxonomy, groupId: string): string[] {
  return Object.entries(taxonomy.skillGroups)
    .filter(([, groups]) => groups.includes(groupId))
    .map(([skill]) => skill)
    .sort();
}

const slug = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/^-|-$/g, '');

export function addGroup(taxonomy: Taxonomy, name: string, color: string): TaxonomyEdit {
  const trimmed = name.trim();
  const id = slug(trimmed);
  if (!trimmed || !id) return { error: 'Enter a group name.' };
  const taken = allGroups(taxonomy).some(
    (group) => group.id === id || group.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (taken) return { error: `There's already a group called ${trimmed}.` };
  return {
    taxonomy: { ...taxonomy, categories: [...taxonomy.categories, { id, name: trimmed, color }] },
  };
}

/** Deletes a group and takes every skill out of it. The skills stay. */
export function removeGroup(taxonomy: Taxonomy, groupId: string): Taxonomy {
  const skillGroups: Record<string, string[]> = {};
  for (const [skill, groups] of Object.entries(taxonomy.skillGroups)) {
    const kept = groups.filter((id) => id !== groupId);
    if (kept.length > 0) skillGroups[skill] = kept;
  }
  return {
    ...taxonomy,
    categories: taxonomy.categories.filter((group) => group.id !== groupId),
    skillGroups,
  };
}

/** Puts a skill (by its canonical name) in a group. */
export function addToGroup(taxonomy: Taxonomy, skill: string, groupId: string): Taxonomy {
  const canonical = canonicalOf(taxonomy, skill);
  const groups = new Set([...(taxonomy.skillGroups[canonical] ?? []), groupId]);
  return { ...taxonomy, skillGroups: { ...taxonomy.skillGroups, [canonical]: [...groups] } };
}

export function removeFromGroup(taxonomy: Taxonomy, skill: string, groupId: string): Taxonomy {
  const canonical = canonicalOf(taxonomy, skill);
  const { [canonical]: groups = [], ...others } = taxonomy.skillGroups;
  const kept = groups.filter((id) => id !== groupId);
  return { ...taxonomy, skillGroups: kept.length > 0 ? { ...others, [canonical]: kept } : others };
}
