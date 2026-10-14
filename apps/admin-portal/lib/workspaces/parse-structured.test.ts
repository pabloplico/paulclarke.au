import { describe, expect, it } from 'vitest';
import generated from '@/lib/demo-seed/generated.json';
import { mergeStructuredData, parseMarkdownToChecklist } from './parse-structured';

describe('mergeStructuredData', () => {
  it('lines table rows up by column name, ignoring case, and adds new columns at the end', () => {
    const merged = mergeStructuredData(
      'table',
      { columns: ['Item', 'Location'], rows: [{ Item: 'Oven', Location: 'Bakehouse' }] },
      { columns: ['item', 'Serviced by'], rows: [{ item: 'Mixer', 'Serviced by': 'In house' }] }
    );
    expect(merged).toEqual({
      columns: ['Item', 'Location', 'Serviced by'],
      rows: [
        { Item: 'Oven', Location: 'Bakehouse' },
        { Item: 'Mixer', 'Serviced by': 'In house' },
      ],
    });
  });

  it('keeps other table settings', () => {
    const merged = mergeStructuredData(
      'table',
      { columns: ['A'], rows: [], showHeader: false },
      { columns: ['A'], rows: [{ A: '1' }] }
    );
    expect(merged).toEqual({ columns: ['A'], rows: [{ A: '1' }], showHeader: false });
  });

  it('appends checklist items, cards and pairs after the existing ones', () => {
    expect(
      mergeStructuredData(
        'checklist',
        { items: [{ text: 'a', checked: true }] },
        { items: [{ text: 'b', checked: false }] }
      )
    ).toEqual({
      items: [
        { text: 'a', checked: true },
        { text: 'b', checked: false },
      ],
    });
    expect(
      mergeStructuredData(
        'cards',
        { items: [{ title: 'a', body: '' }] },
        { items: [{ title: 'b', body: '' }] }
      )
    ).toEqual({
      items: [
        { title: 'a', body: '' },
        { title: 'b', body: '' },
      ],
    });
    expect(
      mergeStructuredData(
        'kv-pairs',
        { pairs: [{ key: 'a', value: '1' }] },
        { pairs: [{ key: 'b', value: '2' }] }
      )
    ).toEqual({
      pairs: [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ],
    });
  });

  it('returns the incoming data when the current data has the wrong shape', () => {
    const incoming = { items: [{ text: 'b', checked: false }] };
    expect(mergeStructuredData('checklist', { pairs: [] }, incoming)).toBe(incoming);
    expect(mergeStructuredData('table', null, { columns: [], rows: [] })).toEqual({
      columns: [],
      rows: [],
    });
  });
});

describe('parseMarkdownToChecklist with listItemsOnly', () => {
  // The suggestions the demo seed routes into checklist sections
  const suggestion = (sectionKey: string) =>
    generated.inboxItem.routingResults.find((r) => r.sectionKey === sectionKey)!.suggestedContent;

  it('keeps only the bullet lines of the seeded allergen memo', () => {
    const memo = suggestion('operations/food-safety');
    const { items } = parseMarkdownToChecklist(memo, { listItemsOnly: true });
    const bullets = memo.split('\n').filter((line) => /^\s*[-*]\s+/.test(line));
    expect(items).toHaveLength(bullets.length);
    expect(items[0]?.text).toMatch(/^All products must display an allergen card/);
    for (const item of items) {
      expect(item.text).not.toMatch(/Allergen Labelling Requirements|^A memo from|^These measures/);
    }
  });

  it('adds nothing from a suggestion that is only a heading and paragraphs', () => {
    const memo = suggestion('staff/onboarding-checklist');
    expect(parseMarkdownToChecklist(memo, { listItemsOnly: true }).items).toEqual([]);
    // Without the option, every line still becomes an item
    expect(parseMarkdownToChecklist(memo).items.length).toBeGreaterThan(0);
  });

  it('keeps numbered and [ ] lines', () => {
    const md = '## Steps\n\nIntro text here.\n\n1. First step\n- [x] Done already\n* Third';
    expect(parseMarkdownToChecklist(md, { listItemsOnly: true }).items).toEqual([
      { text: 'First step', checked: false },
      { text: 'Done already', checked: true },
      { text: 'Third', checked: false },
    ]);
  });
});
