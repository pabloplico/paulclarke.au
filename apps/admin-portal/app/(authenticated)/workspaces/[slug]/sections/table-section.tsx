'use client';

import { Button } from '@repo/ui/button';
import { Input } from '@repo/ui/input';
import { Columns, Eye, EyeOff, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { TableData } from '@/lib/workspaces/types';

interface TableSectionProps {
  data: Record<string, unknown> | null;
  isEditing: boolean;
  saving: boolean;
  onEdit?: () => void;
  onSave: (
    data: { structuredData: TableData; content: string },
    changeDescription?: string
  ) => Promise<void>;
}

function toTableData(data: Record<string, unknown> | null): TableData {
  if (
    !data ||
    !Array.isArray((data as TableData).columns) ||
    !Array.isArray((data as TableData).rows)
  ) {
    return { columns: [], rows: [], showHeader: true };
  }
  const td = data as TableData;
  // Filter out null/undefined/non-string column names
  const columns = td.columns.filter((c): c is string => typeof c === 'string' && c.length > 0);
  return { columns, rows: td.rows, showHeader: td.showHeader !== false };
}

function tableToMarkdown(table: TableData): string {
  if (table.columns.length === 0) return '';
  if (table.showHeader === false) {
    // No header row — just pipe-delimited rows
    return table.rows
      .map((row) => `| ${table.columns.map((col) => row[col] ?? '').join(' | ')} |`)
      .join('\n');
  }
  const header = `| ${table.columns.join(' | ')} |`;
  const separator = `| ${table.columns.map(() => '---').join(' | ')} |`;
  const rows = table.rows.map(
    (row) => `| ${table.columns.map((col) => row[col] ?? '').join(' | ')} |`
  );
  return [header, separator, ...rows].join('\n');
}

export function TableSection({ data, isEditing, saving, onEdit, onSave }: TableSectionProps) {
  const parsed = toTableData(data);
  const [draft, setDraft] = useState<TableData>(parsed);
  const [newColName, setNewColName] = useState('');

  const updateCell = (rowIndex: number, column: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      rows: prev.rows.map((row, i) => (i === rowIndex ? { ...row, [column]: value } : row)),
    }));
  };

  const addRow = () => {
    const emptyRow: Record<string, string> = {};
    for (const col of draft.columns) emptyRow[col] = '';
    setDraft((prev) => ({ ...prev, rows: [...prev.rows, emptyRow] }));
  };

  const removeRow = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      rows: prev.rows.filter((_, i) => i !== index),
    }));
  };

  const addColumn = () => {
    let name = newColName.trim();
    if (!name) {
      let i = draft.columns.length + 1;
      while (draft.columns.includes(`Column ${i}`)) i++;
      name = `Column ${i}`;
    }
    if (draft.columns.includes(name)) return;
    setDraft((prev) => ({
      ...prev,
      columns: [...prev.columns, name],
      rows: prev.rows.map((row) => ({ ...row, [name]: '' })),
    }));
    setNewColName('');
  };

  const removeColumn = (col: string) => {
    setDraft((prev) => ({
      ...prev,
      columns: prev.columns.filter((c) => c !== col),
      rows: prev.rows.map((row) => {
        const { [col]: _, ...rest } = row;
        return rest;
      }),
    }));
  };

  const renameColumn = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName || draft.columns.includes(trimmed)) return;
    setDraft((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => (c === oldName ? trimmed : c)),
      rows: prev.rows.map((row) => {
        const { [oldName]: value, ...rest } = row;
        return { ...rest, [trimmed]: value ?? '' };
      }),
    }));
  };

  const toggleHeader = () => {
    setDraft((prev) => ({ ...prev, showHeader: !prev.showHeader }));
  };

  if (!isEditing) {
    if (parsed.columns.length === 0) {
      return (
        <p
          className="text-sm text-muted-foreground italic cursor-pointer hover:text-muted-foreground/80"
          onDoubleClick={onEdit}
        >
          No table data yet. Double-click or click Edit to add data.
        </p>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {parsed.showHeader !== false && (
            <thead>
              <tr className="border-b border-border">
                {parsed.columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {parsed.rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-white/[0.02]">
                {parsed.columns.map((col) => (
                  <td key={col} className="px-3 py-2 text-foreground/80">
                    {row[col] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={toggleHeader} className="h-7 text-xs gap-1">
          {draft.showHeader ? <EyeOff size={12} /> : <Eye size={12} />}
          {draft.showHeader ? 'Hide Header' : 'Show Header'}
        </Button>
        <div className="flex items-center gap-1">
          <Input
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addColumn()}
            placeholder="New column name..."
            className="h-7 text-xs w-36"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={addColumn}
            disabled={newColName.trim() !== '' && draft.columns.includes(newColName.trim())}
            className="h-7 text-xs gap-1"
          >
            <Columns size={12} />
            Add Column
          </Button>
        </div>
      </div>

      {draft.columns.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Add columns to get started.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {draft.columns.map((col) => (
                  <th key={col} className="px-1 py-1">
                    <div className="flex items-center gap-1">
                      <Input
                        defaultValue={col}
                        onBlur={(e) => renameColumn(col, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            renameColumn(col, e.currentTarget.value);
                            e.currentTarget.blur();
                          }
                        }}
                        className="h-6 text-xs font-medium"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeColumn(col)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400 shrink-0"
                        title={`Remove "${col}" column`}
                      >
                        <Trash2 size={10} />
                      </Button>
                    </div>
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {draft.rows.map((row, ri) => (
                <tr key={ri} className="border-b border-border/50">
                  {draft.columns.map((col) => (
                    <td key={col} className="px-1 py-1">
                      <Input
                        value={row[col] ?? ''}
                        onChange={(e) => updateCell(ri, col, e.target.value)}
                        className="h-7 text-xs"
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(ri)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={addRow} disabled={draft.columns.length === 0}>
          <Plus size={14} className="mr-1.5" />
          Add Row
        </Button>
        <Button
          size="sm"
          disabled={saving || JSON.stringify(draft) === JSON.stringify(parsed)}
          onClick={() =>
            onSave({
              structuredData: draft,
              content: tableToMarkdown(draft),
            })
          }
        >
          <Save size={14} className="mr-1.5" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
