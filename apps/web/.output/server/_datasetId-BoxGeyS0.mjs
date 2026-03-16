import { r as reactExports, j as jsxRuntimeExports } from "./_libs/react.mjs";
import { _ as Route$2, T as Text2, t as getQueryClient, B as Button, b as Input, y as cn, n as Table, o as TableHeader, p as TableRow, q as TableHead, h as Checkbox, r as TableBody, s as TableCell, i as RichTextEditor } from "./_ssr/router-DWBQ1rk2.mjs";
import { C as Container } from "./_ssr/container-CyYjdg0j.mjs";
import { S as Skeleton, T as TableSkeleton } from "./_ssr/table-skeleton-D2NW79t6.mjs";
import { u as useNavigate } from "./_libs/tanstack__react-router.mjs";
import { P as Papa } from "./_libs/papaparse.mjs";
import { a as applyMapping } from "./_ssr/column-mapping-BO7NtC1c.mjs";
import { aE as safeStringifyJson } from "./_ssr/index-D2KejSDZ.mjs";
import { r as relativeTime } from "./_ssr/relativeTime-CCHfweVn.mjs";
import { M as Modal } from "./_ssr/modal-B5gjEbyd.mjs";
import { C as CopyButton } from "./_ssr/index-D_C_pvI9.mjs";
import { u as useDatasetsCollection, a as useDatasetRowsCollection, b as updateRowMutation, d as deleteRowsMutation, s as saveDatasetCsv } from "./_ssr/datasets.collection-DCWne5hJ.mjs";
import { k as Trash2, F as FileUp, L as LoaderCircle, U as Upload, t as Save, X, A as ArrowDown, G as GripVertical } from "./_libs/lucide-react.mjs";
import "./_libs/tanstack__router-core.mjs";
import "./_libs/tiny-invariant.mjs";
import "./_libs/tanstack__history.mjs";
import "node:stream/web";
import "node:stream";
import "./_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "./_libs/tanstack__query-core.mjs";
import "./_libs/tanstack__react-query.mjs";
import "./_ssr/middlewares-BgvwNBR1.mjs";
import "./_ssr/index.mjs";
import "node:async_hooks";
import "./_libs/tiny-warning.mjs";
import "./_libs/isbot.mjs";
import "./_libs/effect.mjs";
import "./_libs/zod.mjs";
import "events";
import "dns";
import "fs";
import "net";
import "tls";
import "path";
import "string_decoder";
import "http";
import "https";
import "child_process";
import "assert";
import "url";
import "tty";
import "buffer";
import "zlib";
import "node:os";
import "os";
import "node:crypto";
import "path/posix";
import "node:util";
import "fs/promises";
import "node:fs/promises";
import "node:process";
import "node:path";
import "node:fs";
import "node:zlib";
import "./_libs/tanstack__query-db-collection.mjs";
import "./_libs/tanstack__db.mjs";
import "./_libs/tanstack__db-ivm.mjs";
import "./_libs/fractional-indexing.mjs";
import "./_libs/tanstack__react-db.mjs";
const bucketMeta = {
  input: {
    label: "Input",
    icon: "↘",
    border: "border-blue-200 dark:border-blue-800",
    bg: "bg-blue-50/50 dark:bg-blue-950/20",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    dropHighlight: "border-blue-400 bg-blue-50 dark:bg-blue-950/40"
  },
  output: {
    label: "Output",
    icon: "=",
    border: "border-green-200 dark:border-green-800",
    bg: "bg-green-50/50 dark:bg-green-950/20",
    badge: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    dropHighlight: "border-green-400 bg-green-50 dark:bg-green-950/40"
  },
  metadata: {
    label: "Metadata",
    icon: "{}",
    border: "border-amber-200 dark:border-amber-800",
    bg: "bg-amber-50/50 dark:bg-amber-950/20",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    dropHighlight: "border-amber-400 bg-amber-50 dark:bg-amber-950/40"
  }
};
const bucketOrder = ["input", "output", "metadata"];
function ColumnMapper({
  headers,
  mapping,
  onMappingChange,
  options,
  onOptionsChange,
  onSave,
  saving
}) {
  const moveAllToInput = reactExports.useCallback(() => {
    onMappingChange({ input: [...headers], output: [], metadata: [] });
  }, [headers, onMappingChange]);
  const moveHeader = reactExports.useCallback(
    (header, target) => {
      const input = mapping.input.filter((h) => h !== header);
      const output = mapping.output.filter((h) => h !== header);
      const metadata = mapping.metadata.filter((h) => h !== header);
      onMappingChange({
        input: target === "input" ? [...input, header] : input,
        output: target === "output" ? [...output, header] : output,
        metadata: target === "metadata" ? [...metadata, header] : metadata
      });
    },
    [mapping, onMappingChange]
  );
  const removeHeader = reactExports.useCallback(
    (header) => {
      onMappingChange({
        input: mapping.input.filter((h) => h !== header),
        output: mapping.output.filter((h) => h !== header),
        metadata: mapping.metadata.filter((h) => h !== header)
      });
    },
    [mapping, onMappingChange]
  );
  const unmapped = headers.filter(
    (h) => !mapping.input.includes(h) && !mapping.output.includes(h) && !mapping.metadata.includes(h)
  );
  const totalMapped = mapping.input.length + mapping.output.length + mapping.metadata.length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col flex-1 min-h-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center justify-between px-4 py-3 border-b", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { weight: "bold", children: "Column Mapping" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { onClick: onSave, disabled: saving || totalMapped === 0, isLoading: saving, size: "sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "white", children: "Save mapping" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex flex-row items-center gap-2 cursor-pointer select-none", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "checkbox",
              checked: options.flattenSingleColumn,
              onChange: (e) => onOptionsChange({ ...options, flattenSingleColumn: e.target.checked }),
              className: "h-4 w-4 rounded border-input accent-primary cursor-pointer"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Flatten single-column values" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex flex-row items-center gap-2 cursor-pointer select-none", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "checkbox",
              checked: options.autoParseJson,
              onChange: (e) => onOptionsChange({ ...options, autoParseJson: e.target.checked }),
              className: "h-4 w-4 rounded border-input accent-primary cursor-pointer"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Auto-parse objects in strings" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-row items-center gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", size: "sm", onClick: moveAllToInput, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Move all to input" }) }) })
      ] }),
      unmapped.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(UnmappedSection, { headers: unmapped, onMove: moveHeader }),
      bucketOrder.map((bucket) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        BucketSection,
        {
          bucket,
          headers: mapping[bucket],
          onDrop: (header) => moveHeader(header, bucket),
          onRemove: removeHeader
        },
        bucket
      ))
    ] }) })
  ] });
}
function UnmappedSection({ headers, onMove }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { weight: "bold", color: "foregroundMuted", children: "Unassigned" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H6, { color: "foregroundMuted", children: [
        "(",
        headers.length,
        ")"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-1", children: headers.map((header) => /* @__PURE__ */ jsxRuntimeExports.jsx(DraggableHeaderItem, { header, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-row items-center gap-2", children: bucketOrder.map((bucket) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        className: `rounded px-1.5 py-0.5 text-xs transition-colors hover:opacity-80 ${bucketMeta[bucket].badge}`,
        onClick: () => onMove(header, bucket),
        children: bucketMeta[bucket].label
      },
      bucket
    )) }) }, header)) })
  ] });
}
function BucketSection({
  bucket,
  headers,
  onDrop,
  onRemove
}) {
  const [dragOver, setDragOver] = reactExports.useState(false);
  const meta = bucketMeta[bucket];
  const handleDragOver = reactExports.useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }, []);
  const handleDragLeave = reactExports.useCallback(() => {
    setDragOver(false);
  }, []);
  const handleDrop = reactExports.useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const header = e.dataTransfer.getData("text/plain");
      if (header) onDrop(header);
    },
    [onDrop]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      role: "listbox",
      className: `flex flex-col gap-2 rounded-lg border p-3 transition-colors ${dragOver ? meta.dropHighlight : `${meta.border} ${meta.bg}`}`,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-sm", children: meta.icon }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded px-2 py-0.5 text-xs font-semibold ${meta.badge}`, children: meta.label }),
          headers.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H6, { color: "foregroundMuted", children: [
            "(",
            headers.length,
            ")"
          ] })
        ] }),
        headers.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center rounded border border-dashed border-current/20 py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-1.5 text-muted-foreground", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowDown, { className: "h-3 w-3" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: "Drop columns here" })
        ] }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-1", children: headers.map((header) => /* @__PURE__ */ jsxRuntimeExports.jsx(DraggableHeaderItem, { header, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors",
            onClick: () => onRemove(header),
            children: "Remove"
          }
        ) }, header)) })
      ]
    }
  );
}
function DraggableHeaderItem({ header, children }) {
  const handleDragStart = reactExports.useCallback(
    (e) => {
      e.dataTransfer.setData("text/plain", header);
      e.dataTransfer.effectAllowed = "move";
    },
    [header]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      role: "option",
      tabIndex: 0,
      draggable: true,
      onDragStart: handleDragStart,
      className: "flex flex-row items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 cursor-grab active:cursor-grabbing hover:bg-secondary/50 transition-colors",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(GripVertical, { className: "h-4 w-4 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: header })
        ] }),
        children
      ]
    }
  );
}
const PREVIEW_LIMIT = 50;
function CsvPreviewTable({ csvRows, totalRows, mapping, options }) {
  const previewRows = reactExports.useMemo(() => {
    const slice = csvRows.slice(0, PREVIEW_LIMIT);
    return slice.map((row) => applyMapping(row, mapping, options));
  }, [csvRows, mapping, options]);
  const hasMappedColumns = mapping.input.length + mapping.output.length + mapping.metadata.length > 0;
  if (!hasMappedColumns) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col flex-1 min-h-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(PreviewHeader, { totalRows }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-1 items-center justify-center p-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: "Assign columns on the right to see a preview" }) })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col flex-1 min-h-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PreviewHeader, { totalRows }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Table, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { verticalPadding: true, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: "#" }) }),
          mapping.input.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ColumnBadge, { label: "Input", color: "blue" }) }),
          mapping.output.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ColumnBadge, { label: "Output", color: "green" }) }),
          mapping.metadata.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ColumnBadge, { label: "Metadata", color: "amber" }) })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableBody, { children: previewRows.map((row, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { verticalPadding: true, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: i + 1 }) }),
          mapping.input.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(JsonCell, { value: row.input }) }),
          mapping.output.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(JsonCell, { value: row.output }) }),
          mapping.metadata.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(JsonCell, { value: row.metadata }) })
        ] }, `preview-${i.toString()}`)) })
      ] }),
      csvRows.length > PREVIEW_LIMIT && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center py-3 border-t", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H6, { color: "foregroundMuted", children: [
        "Showing ",
        PREVIEW_LIMIT,
        " of ",
        totalRows,
        " rows"
      ] }) })
    ] })
  ] });
}
function PreviewHeader({ totalRows }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center justify-between px-4 py-3 border-b", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { weight: "bold", children: "Row Preview" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H6, { color: "foregroundMuted", children: [
      totalRows,
      " rows"
    ] })
  ] });
}
function ColumnBadge({ label, color }) {
  const colors = {
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex rounded px-2 py-0.5 text-xs font-semibold ${colors[color]}`, children: label });
}
function JsonCell({ value }) {
  const keys = Object.keys(value);
  if (keys.length === 0) return /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: "—" });
  if (keys.length === 1 && keys[0] === "value") {
    const v = value.value;
    return /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { className: "max-w-64 truncate", children: typeof v === "string" ? v : JSON.stringify(v) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "max-w-64 truncate text-xs font-mono text-foreground/80", children: JSON.stringify(value, null, 0) });
}
function CsvImportView({ title, subtitle, parsedCsv, onCancel, onSave }) {
  const [mapping, setMapping] = reactExports.useState(() => ({
    input: [...parsedCsv.headers],
    output: [],
    metadata: []
  }));
  const [options, setOptions] = reactExports.useState({
    flattenSingleColumn: false,
    autoParseJson: false
  });
  const [saving, setSaving] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const handleSave = reactExports.useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ file: parsedCsv.file, mapping, options });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save dataset");
    } finally {
      setSaving(false);
    }
  }, [parsedCsv.file, mapping, options, onSave]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 flex-1 min-h-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center justify-between px-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { weight: "bold", children: title }),
        subtitle && /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: subtitle })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", size: "sm", onClick: onCancel, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Cancel" }) })
    ] }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-row items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "destructive", children: error }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row flex-1 min-h-0 border rounded-lg overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col w-3/5 min-h-0 border-r", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        CsvPreviewTable,
        {
          csvRows: parsedCsv.rows,
          totalRows: parsedCsv.rows.length,
          mapping,
          options
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col w-2/5 min-h-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ColumnMapper,
        {
          headers: parsedCsv.headers,
          mapping,
          onMappingChange: setMapping,
          options,
          onOptionsChange: setOptions,
          onSave: handleSave,
          saving
        }
      ) })
    ] })
  ] });
}
function truncateJson(data, maxLen = 30) {
  if (typeof data === "string") return data.length > maxLen ? `${data.slice(0, maxLen)}…` : data;
  const values = Object.values(data);
  if (values.length === 0) return "{}";
  const first = String(values[0]);
  return first.length > maxLen ? `${first.slice(0, maxLen)}…` : first;
}
function DatasetTable({
  rows,
  selectedRowId,
  onSelectRow,
  headerCheckboxState,
  onToggleAll,
  isRowSelected,
  onToggleRow
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Table, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { verticalPadding: true, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { className: "w-10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Checkbox, { checked: headerCheckboxState, onCheckedChange: onToggleAll, className: "hit-area-3" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Created" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Input" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Output" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableBody, { children: rows.map((row) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      TableRow,
      {
        verticalPadding: true,
        className: `cursor-pointer ${selectedRowId === row.rowId ? "bg-accent" : ""}`,
        onClick: () => onSelectRow(row),
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            Checkbox,
            {
              checked: isRowSelected(row.rowId),
              onCheckedChange: (checked) => onToggleRow(row.rowId, checked),
              onClick: (e) => e.stopPropagation(),
              className: "hit-area-3"
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: relativeTime(row.createdAt) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { className: "font-mono truncate max-w-48", children: truncateJson(row.input) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { className: "font-mono truncate max-w-48", children: truncateJson(row.output) }) })
        ]
      },
      row.rowId
    )) })
  ] });
}
function DeleteRowsModal({ open, onOpenChange, selectedCount, onConfirm, deleting }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Modal,
    {
      open,
      onOpenChange,
      title: "Delete selected rows",
      description: `You are about to delete ${selectedCount} row${selectedCount === 1 ? "" : "s"}. This will create a new dataset version.`,
      dismissible: true,
      footer: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => onOpenChange(false), disabled: deleting, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: "Cancel" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "destructive", onClick: onConfirm, disabled: deleting, children: [
          deleting ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H5, { color: "white", children: [
            "Delete ",
            selectedCount,
            " row",
            selectedCount === 1 ? "" : "s"
          ] })
        ] })
      ] })
    }
  );
}
function EditableSection({
  title,
  value,
  onChange,
  defaultOpen = true
}) {
  const [open, setOpen] = reactExports.useState(defaultOpen);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", className: "flex items-center gap-1.5 cursor-pointer", onClick: () => setOpen(!open), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: open ? "▾" : "▸" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { weight: "bold", children: title })
    ] }),
    open && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RichTextEditor, { value, onChange }) })
  ] });
}
function RowDetailPanel({
  row,
  onClose,
  onSave,
  saving = false
}) {
  const [inputText, setInputText] = reactExports.useState(() => safeStringifyJson(row.input));
  const [outputText, setOutputText] = reactExports.useState(() => safeStringifyJson(row.output));
  const [metadataText, setMetadataText] = reactExports.useState(() => safeStringifyJson(row.metadata));
  reactExports.useEffect(() => {
    setInputText(safeStringifyJson(row.input));
    setOutputText(safeStringifyJson(row.output));
    setMetadataText(safeStringifyJson(row.metadata));
  }, [row.input, row.output, row.metadata]);
  const handleSave = reactExports.useCallback(() => {
    onSave?.({ input: inputText, output: outputText, metadata: metadataText });
  }, [inputText, outputText, metadataText, onSave]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full border-l", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center justify-between px-4 py-3 border-b", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", className: "font-mono truncate", children: row.rowId }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-2", children: [
        onSave && /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: handleSave, disabled: saving, size: "sm", children: [
          saving ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "white", children: "Save Data" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { flat: true, variant: "ghost", onClick: onClose, children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-4 h-4" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 p-4 overflow-y-auto flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(EditableSection, { title: "Input", value: inputText, onChange: setInputText }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EditableSection, { title: "Output", value: outputText, onChange: setOutputText }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EditableSection, { title: "Metadata", value: metadataText, onChange: setMetadataText })
    ] })
  ] });
}
function VersionBadge({ versionId }) {
  if (!versionId) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 rounded-md border px-2.5 py-1 bg-muted/50", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H6, { color: "foregroundMuted", className: "font-mono uppercase tracking-wider", children: [
      "v:",
      versionId
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { value: versionId })
  ] });
}
function useSelectableRows({
  rowIds,
  initialSelection = [],
  totalRowCount
}) {
  const [selectionState, setSelectionState] = reactExports.useState(() => ({
    mode: initialSelection.length > 0 ? "PARTIAL" : "NONE",
    selectedIds: new Set(initialSelection),
    excludedIds: /* @__PURE__ */ new Set()
  }));
  const headerState = reactExports.useMemo(() => {
    switch (selectionState.mode) {
      case "ALL":
        return true;
      case "NONE":
        return false;
      case "PARTIAL":
      case "ALL_EXCEPT":
        return "indeterminate";
    }
  }, [selectionState.mode]);
  const toggleRow = reactExports.useCallback((id, checked) => {
    if (id === void 0) return;
    setSelectionState((prev) => {
      const newState = {
        mode: prev.mode,
        selectedIds: new Set(prev.selectedIds),
        excludedIds: new Set(prev.excludedIds)
      };
      switch (prev.mode) {
        case "ALL":
          if (!checked) {
            newState.mode = "ALL_EXCEPT";
            newState.excludedIds = /* @__PURE__ */ new Set([id]);
          }
          break;
        case "NONE":
          if (checked) {
            newState.mode = "PARTIAL";
            newState.selectedIds = /* @__PURE__ */ new Set([id]);
          }
          break;
        case "PARTIAL":
          if (checked) {
            newState.selectedIds.add(id);
          } else {
            newState.selectedIds.delete(id);
            if (newState.selectedIds.size === 0) {
              newState.mode = "NONE";
            }
          }
          break;
        case "ALL_EXCEPT":
          if (checked) {
            newState.excludedIds.delete(id);
            if (newState.excludedIds.size === 0) {
              newState.mode = "ALL";
            }
          } else {
            newState.excludedIds.add(id);
          }
          break;
      }
      return newState;
    });
  }, []);
  const clearSelections = reactExports.useCallback(() => {
    setSelectionState({
      mode: "NONE",
      selectedIds: /* @__PURE__ */ new Set(),
      excludedIds: /* @__PURE__ */ new Set()
    });
  }, []);
  const toggleAll = reactExports.useCallback(() => {
    setSelectionState((prev) => {
      if (prev.mode === "ALL") {
        return {
          mode: "NONE",
          selectedIds: /* @__PURE__ */ new Set(),
          excludedIds: /* @__PURE__ */ new Set()
        };
      }
      return {
        mode: "ALL",
        selectedIds: /* @__PURE__ */ new Set(),
        excludedIds: /* @__PURE__ */ new Set()
      };
    });
  }, []);
  const selectedRowIds = reactExports.useMemo(() => {
    switch (selectionState.mode) {
      case "ALL":
        return rowIds.filter((id) => !selectionState.excludedIds.has(id));
      case "NONE":
        return [];
      case "PARTIAL":
        return Array.from(selectionState.selectedIds);
      case "ALL_EXCEPT":
        return rowIds.filter((id) => !selectionState.excludedIds.has(id));
    }
  }, [selectionState, rowIds]);
  const selectedCount = reactExports.useMemo(() => {
    switch (selectionState.mode) {
      case "ALL":
        return totalRowCount - selectionState.excludedIds.size;
      case "NONE":
        return 0;
      case "PARTIAL":
        return selectionState.selectedIds.size;
      case "ALL_EXCEPT":
        return totalRowCount - selectionState.excludedIds.size;
    }
  }, [selectionState.mode, selectionState.excludedIds, selectionState.selectedIds, totalRowCount]);
  return reactExports.useMemo(() => {
    const isSelected = (id) => {
      if (id === void 0) return false;
      switch (selectionState.mode) {
        case "ALL":
          return !selectionState.excludedIds.has(id);
        case "NONE":
          return false;
        case "PARTIAL":
          return selectionState.selectedIds.has(id);
        case "ALL_EXCEPT":
          return !selectionState.excludedIds.has(id);
      }
    };
    return {
      selectedCount,
      selectionMode: selectionState.mode,
      excludedIds: selectionState.excludedIds,
      selectedRowIds,
      toggleRow,
      toggleAll,
      clearSelections,
      isSelected,
      headerState
    };
  }, [
    selectedCount,
    selectionState.mode,
    selectionState.excludedIds,
    selectionState.selectedIds,
    selectedRowIds,
    toggleRow,
    toggleAll,
    clearSelections,
    headerState
  ]);
}
function DatasetDetailPage() {
  const {
    projectId,
    datasetId
  } = Route$2.useParams();
  const datasetsCollection = useDatasetsCollection(projectId);
  const dataset = datasetsCollection.data?.find((d) => d.id === datasetId);
  const isLoading = !datasetsCollection.data;
  const [parsedCsv, setParsedCsv] = reactExports.useState(null);
  if (isLoading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(Container, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 pt-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "h-8 w-48" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "h-96 w-full" })
    ] }) });
  }
  if (!dataset) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(Container, { children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center pt-20", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: "Dataset not found" }) }) });
  }
  const hasRows = dataset.currentVersion > 0;
  if (hasRows && !parsedCsv) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(DatasetRowsView, { projectId, datasetId, dataset, onImport: setParsedCsv });
  }
  if (parsedCsv) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(CsvMappingView, { projectId, datasetId, dataset, parsedCsv, onCancel: () => setParsedCsv(null) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(UploadBlankSlate, { dataset, onParsed: setParsedCsv });
}
function UploadBlankSlate({
  dataset,
  onParsed
}) {
  const fileInputRef = reactExports.useRef(null);
  const [isDragOver, setIsDragOver] = reactExports.useState(false);
  const [parsing, setParsing] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const handleFile = reactExports.useCallback(async (file) => {
    setParsing(true);
    setError(null);
    try {
      const text = await file.text();
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true
      });
      if (!result.meta.fields || result.meta.fields.length === 0) {
        setError("Could not detect any columns in this CSV");
        return;
      }
      onParsed({
        headers: result.meta.fields,
        rows: result.data,
        file
      });
    } catch {
      setError("Failed to parse CSV file");
    } finally {
      setParsing(false);
    }
  }, [onParsed]);
  const handleDrop = reactExports.useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Container, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 flex-1 min-h-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { weight: "bold", children: dataset.name }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-row items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "destructive", children: error }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { role: "button", tabIndex: 0, className: cn("flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-16 transition-colors", {
      "border-primary bg-primary/5": isDragOver,
      "border-border": !isDragOver
    }), onDragOver: (e) => {
      e.preventDefault();
      setIsDragOver(true);
    }, onDragLeave: () => setIsDragOver(false), onDrop: handleDrop, onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
    }, children: parsing ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-12 w-12 animate-spin text-muted-foreground" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: "Reading CSV..." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Upload, { className: "h-12 w-12 text-muted-foreground" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H4, { weight: "bold", children: "Upload a CSV file" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: "Drag and drop your CSV file here to populate this dataset" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", onClick: () => fileInputRef.current?.click(), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(FileUp, { className: "h-4 w-4" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: "Choose file" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { ref: fileInputRef, type: "file", accept: ".csv", className: "hidden", onChange: (e) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
      } })
    ] }) })
  ] }) });
}
function CsvMappingView({
  projectId,
  datasetId,
  dataset,
  parsedCsv,
  onCancel
}) {
  const handleSave = reactExports.useCallback(async ({
    file,
    mapping,
    options
  }) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("datasetId", datasetId);
    formData.append("projectId", projectId);
    formData.append("mapping", JSON.stringify(mapping));
    formData.append("options", JSON.stringify(options));
    await saveDatasetCsv({
      data: formData
    });
    getQueryClient().invalidateQueries({
      queryKey: ["datasets", projectId]
    });
    getQueryClient().invalidateQueries({
      queryKey: ["datasetRows", datasetId]
    });
    onCancel();
  }, [datasetId, projectId, onCancel]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Container, { size: "full", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CsvImportView, { title: dataset.name, subtitle: parsedCsv.file.name, parsedCsv, onCancel, onSave: handleSave }) });
}
function DatasetRowsView({
  projectId,
  datasetId,
  dataset,
  onImport
}) {
  const navigate = useNavigate();
  const {
    rid
  } = Route$2.useSearch();
  const [search, setSearch] = reactExports.useState("");
  const deferredSearch = reactExports.useDeferredValue(search);
  const [selectedRowId, setSelectedRowId] = reactExports.useState(rid ?? null);
  const [saving, setSaving] = reactExports.useState(false);
  const [deleting, setDeleting] = reactExports.useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = reactExports.useState(false);
  const [currentVersion, setCurrentVersion] = reactExports.useState(dataset.currentVersion);
  const [currentVersionId, setCurrentVersionId] = reactExports.useState(dataset.latestVersionId);
  const rowsCollection = useDatasetRowsCollection(datasetId, deferredSearch);
  const rows = rowsCollection.data ?? [];
  const isLoading = !rowsCollection.data;
  const selectedRow = selectedRowId ? rows.find((r) => r.rowId === selectedRowId) ?? null : null;
  const importFileRef = reactExports.useRef(null);
  const rowIds = rows.map((r) => r.rowId);
  const selection = useSelectableRows({
    rowIds,
    totalRowCount: rows.length
  });
  const openRow = reactExports.useCallback((row) => {
    setSelectedRowId(row.rowId);
    navigate({
      to: ".",
      search: {
        rid: row.rowId
      },
      replace: true
    });
  }, [navigate]);
  const closeRow = reactExports.useCallback(() => {
    setSelectedRowId(null);
    navigate({
      to: ".",
      search: {},
      replace: true
    });
  }, [navigate]);
  const handleSaveRow = reactExports.useCallback(async (data) => {
    if (!selectedRowId) return;
    setSaving(true);
    try {
      const result = await updateRowMutation({
        data: {
          datasetId,
          rowId: selectedRowId,
          input: data.input,
          output: data.output,
          metadata: data.metadata
        }
      });
      setCurrentVersion(result.version);
      setCurrentVersionId(result.versionId);
      getQueryClient().invalidateQueries({
        queryKey: ["datasets", projectId]
      });
      getQueryClient().invalidateQueries({
        queryKey: ["datasetRows", datasetId]
      });
    } finally {
      setSaving(false);
    }
  }, [selectedRowId, datasetId, projectId]);
  const handleDeleteRows = reactExports.useCallback(async () => {
    const ids = selection.selectedRowIds;
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      const result = await deleteRowsMutation({
        data: {
          datasetId,
          rowIds: ids
        }
      });
      setCurrentVersion(result.version);
      setCurrentVersionId(result.versionId);
      if (selectedRowId && ids.includes(selectedRowId)) {
        closeRow();
      }
      selection.clearSelections();
      setDeleteModalOpen(false);
      getQueryClient().invalidateQueries({
        queryKey: ["datasets", projectId]
      });
      getQueryClient().invalidateQueries({
        queryKey: ["datasetRows", datasetId]
      });
    } finally {
      setDeleting(false);
    }
  }, [selection, datasetId, projectId, selectedRowId, closeRow]);
  const handleImportFile = reactExports.useCallback(async (file) => {
    try {
      const text = await file.text();
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true
      });
      if (!result.meta.fields || result.meta.fields.length === 0) return;
      onImport({
        headers: result.meta.fields,
        rows: result.data,
        file
      });
    } catch {
    }
  }, [onImport]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Container, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 flex-1 min-h-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { weight: "bold", children: dataset.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(VersionBadge, { versionId: currentVersionId, version: currentVersion })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-2", children: [
          selection.selectedCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "destructive", size: "sm", onClick: () => setDeleteModalOpen(true), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-4 w-4" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H6, { color: "white", children: [
              "Delete ",
              selection.selectedCount
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", size: "sm", onClick: () => importFileRef.current?.click(), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(FileUp, { className: "h-4 w-4" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Import" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { ref: importFileRef, type: "file", accept: ".csv", className: "hidden", onChange: (e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
          } })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row flex-1 min-h-0 border rounded-lg overflow-hidden", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex flex-col ${selectedRow ? "w-1/2" : "w-full"} min-h-0`, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-row items-center gap-2 px-4 py-3 border-b", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "text", placeholder: "Search rows...", value: search, onChange: (e) => setSearch(e.target.value), className: "flex-1" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto p-4", children: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx(TableSkeleton, { cols: 5, rows: 8 }) : rows.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(DatasetTable, { rows, selectedRowId: selectedRow?.rowId ?? null, onSelectRow: openRow, headerCheckboxState: selection.headerState, onToggleAll: selection.toggleAll, isRowSelected: selection.isSelected, onToggleRow: selection.toggleRow }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center p-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: "No rows found" }) }) })
        ] }),
        selectedRow && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-1/2 min-h-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RowDetailPanel, { row: selectedRow, onClose: closeRow, onSave: handleSaveRow, saving }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(DeleteRowsModal, { open: deleteModalOpen, onOpenChange: setDeleteModalOpen, selectedCount: selection.selectedCount, onConfirm: handleDeleteRows, deleting })
  ] });
}
export {
  DatasetDetailPage as component
};
