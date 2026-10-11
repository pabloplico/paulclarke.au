import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('converts CSV to markdown table', async () => {
    const csv = 'Name,Age,City\nAlice,30,Sydney\nBob,25,Melbourne';
    const result = await parseCsv(Buffer.from(csv), 'test.csv');
    expect(result.text).toContain('| Name | Age | City |');
    expect(result.text).toContain('| --- | --- | --- |');
    expect(result.text).toContain('| Alice | 30 | Sydney |');
    expect(result.text).toContain('| Bob | 25 | Melbourne |');
  });

  it('escapes pipe characters in cell values', async () => {
    const csv = 'Formula,Result\n"a | b",ok';
    const result = await parseCsv(Buffer.from(csv), 'test.csv');
    expect(result.text).toContain('a \\| b');
  });

  it('reports row and column counts in metadata', async () => {
    const csv = 'A,B\n1,2\n3,4\n5,6';
    const result = await parseCsv(Buffer.from(csv), 'test.csv');
    expect(result.metadata).toEqual(
      expect.objectContaining({
        rowCount: 3,
        columnCount: 2,
        columns: ['A', 'B'],
      })
    );
  });

  it('skips empty lines', async () => {
    const csv = 'X,Y\n1,2\n\n3,4\n';
    const result = await parseCsv(Buffer.from(csv), 'test.csv');
    expect(result.metadata).toEqual(expect.objectContaining({ rowCount: 2 }));
  });
});
