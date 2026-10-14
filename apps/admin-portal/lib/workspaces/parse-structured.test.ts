import { describe, expect, it } from 'vitest';
import { mergeStructuredData } from './parse-structured';

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
