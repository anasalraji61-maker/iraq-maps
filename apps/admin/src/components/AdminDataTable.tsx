/**
 * AdminDataTable — reusable sortable/filterable data table with pagination,
 * column resizing, CSV export, row selection, and bulk actions.
 */
import { useState, useRef, useCallback, type ReactNode, type CSSProperties } from 'react';
import { thStyle, tdStyle } from './shared';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  label: string;
  /** Width in px. Default 150. */
  width?: number;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  /** Raw value used for CSV export (defaults to row[key]) */
  csvValue?: (row: T) => string;
}

export interface BulkAction<T> {
  label: string;
  color?: string;
  onClick: (rows: T[]) => void | Promise<void>;
}

interface Props<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[];
  pageSize?: number;
  bulkActions?: BulkAction<T>[];
  onRowClick?: (row: T) => void;
  rowHighlight?: (row: T) => string | undefined;
  /** File name stem for CSV export */
  exportName?: string;
  loading?: boolean;
  emptyMessage?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function exportCsv<T>(columns: Column<T>[], rows: T[], name: string) {
  const header = columns.map((c) => `"${c.label}"`).join(',');
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const raw = c.csvValue ? c.csvValue(r) : String((r as Record<string, unknown>)[c.key] ?? '');
          return `"${raw.replace(/"/g, '""')}"`;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminDataTable<T extends { id: string }>({
  columns: initialColumns,
  rows,
  pageSize = 20,
  bulkActions = [],
  onRowClick,
  rowHighlight,
  exportName = 'export',
  loading = false,
  emptyMessage = 'No data.',
}: Props<T>) {
  // Column widths (resizable)
  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialColumns.map((c) => [c.key, c.width ?? 150])),
  );

  // Sort
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [page, setPage] = useState(1);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Resize state
  const resizingCol = useRef<string | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  // Bulk action busy
  const [bulkBusy, setBulkBusy] = useState(false);

  // ── Sort ────────────────────────────────────────────────────────────────────

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }

  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const av = String((a as Record<string, unknown>)[sortKey] ?? '');
        const bv = String((b as Record<string, unknown>)[sortKey] ?? '');
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : rows;

  // ── Pagination ───────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);

  // ── Selection ────────────────────────────────────────────────────────────────

  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  function togglePageAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageRows.forEach((r) => next.delete(r.id));
      } else {
        pageRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Column resize ────────────────────────────────────────────────────────────

  const onResizeMouseDown = useCallback(
    (key: string, e: React.MouseEvent) => {
      e.preventDefault();
      resizingCol.current = key;
      resizeStartX.current = e.clientX;
      resizeStartW.current = colWidths[key] ?? 150;

      function onMove(me: MouseEvent) {
        if (!resizingCol.current) return;
        const delta = me.clientX - resizeStartX.current;
        setColWidths((prev) => ({
          ...prev,
          [resizingCol.current!]: Math.max(60, resizeStartW.current + delta),
        }));
      }
      function onUp() {
        resizingCol.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [colWidths],
  );

  // ── Bulk action ──────────────────────────────────────────────────────────────

  async function runBulk(action: BulkAction<T>) {
    const selectedRows = rows.filter((r) => selected.has(r.id));
    if (!selectedRows.length) return;
    setBulkBusy(true);
    try {
      await action.onClick(selectedRows);
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  }

  // ── Styles ───────────────────────────────────────────────────────────────────

  const wrapStyle: CSSProperties = {
    overflowX: 'auto',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    background: '#fff',
  };

  const toolbarStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderBottom: '1px solid #eee',
    background: '#fafafa',
    flexWrap: 'wrap',
  };

  const headerCellStyle = (key: string): CSSProperties => ({
    ...thStyle,
    width: colWidths[key] ?? 150,
    position: 'relative',
    userSelect: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });

  const resizerStyle: CSSProperties = {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 5,
    cursor: 'col-resize',
    background: 'transparent',
  };

  const pageBtnStyle = (active: boolean): CSSProperties => ({
    padding: '4px 10px',
    border: '1px solid #ccc',
    borderRadius: 4,
    background: active ? '#1565c0' : '#fff',
    color: active ? '#fff' : '#333',
    cursor: 'pointer',
    fontSize: 13,
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <span style={{ fontSize: 13, color: '#555' }}>
          {selected.size > 0 ? `${selected.size} selected` : `${sorted.length} rows`}
        </span>
        {/* Bulk actions */}
        {bulkActions.length > 0 && selected.size > 0 && (
          <>
            <span style={{ fontSize: 13, color: '#999' }}>|</span>
            {bulkActions.map((a) => (
              <button
                key={a.label}
                disabled={bulkBusy}
                onClick={() => runBulk(a)}
                style={{
                  padding: '4px 12px',
                  border: 'none',
                  borderRadius: 4,
                  background: a.color ?? '#1565c0',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  opacity: bulkBusy ? 0.6 : 1,
                }}
              >
                {a.label}
              </button>
            ))}
          </>
        )}
        <div style={{ flex: 1 }} />
        {/* CSV export */}
        <button
          onClick={() => exportCsv(initialColumns, rows, exportName)}
          style={{
            padding: '4px 12px',
            border: '1px solid #ccc',
            borderRadius: 4,
            background: '#fff',
            cursor: 'pointer',
            fontSize: 13,
            color: '#333',
          }}
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Table */}
      <div style={wrapStyle}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {/* Checkbox column */}
              <th style={{ ...thStyle, width: 40, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={togglePageAll}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              {initialColumns.map((col) => (
                <th
                  key={col.key}
                  style={headerCellStyle(col.key)}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span style={{ marginInlineStart: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                  {/* Resizer handle */}
                  <span
                    style={resizerStyle}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => onResizeMouseDown(col.key, e)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={initialColumns.length + 1}
                  style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 14 }}
                >
                  Loading…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={initialColumns.length + 1}
                  style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 14 }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row)}
                  style={{
                    background: rowHighlight?.(row) ?? (selected.has(row.id) ? '#e3f2fd' : undefined),
                    cursor: onRowClick ? 'pointer' : undefined,
                  }}
                >
                  <td
                    style={{ ...tdStyle, width: 40, textAlign: 'center' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  {initialColumns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        ...tdStyle,
                        width: colWidths[col.key] ?? 150,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 0', justifyContent: 'center' }}>
          <button
            style={pageBtnStyle(false)}
            disabled={page === 1}
            onClick={() => setPage(1)}
          >
            «
          </button>
          <button
            style={pageBtnStyle(false)}
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </button>
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(page - 3, totalPages - 6));
            const p = start + i;
            return (
              <button key={p} style={pageBtnStyle(p === page)} onClick={() => setPage(p)}>
                {p}
              </button>
            );
          })}
          <button
            style={pageBtnStyle(false)}
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            ›
          </button>
          <button
            style={pageBtnStyle(false)}
            disabled={page === totalPages}
            onClick={() => setPage(totalPages)}
          >
            »
          </button>
          <span style={{ fontSize: 13, color: '#666', marginInlineStart: 8 }}>
            Page {page} / {totalPages}
          </span>
        </div>
      )}
    </div>
  );
}
