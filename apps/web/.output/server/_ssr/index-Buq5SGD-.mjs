import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { K as Route$5, l as TableWithHeader, m as TableBlankSlate, n as Table, o as TableHeader, p as TableRow, q as TableHead, r as TableBody, s as TableCell, T as Text2 } from "./router-DWBQ1rk2.mjs";
import { C as Container } from "./container-CyYjdg0j.mjs";
import { T as TableSkeleton } from "./table-skeleton-D2NW79t6.mjs";
import { aB as formatCount, aC as formatPrice, aD as formatDuration } from "./index-D2KejSDZ.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { u as useTracesCollection } from "./spans.collection-Ov7aCc-C.mjs";
import "../_libs/papaparse.mjs";
import "stream";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tiny-invariant.mjs";
import "../_libs/tanstack__history.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
import "./middlewares-BgvwNBR1.mjs";
import "./index.mjs";
import "node:async_hooks";
import "../_libs/tiny-warning.mjs";
import "../_libs/isbot.mjs";
import "../_libs/effect.mjs";
import "../_libs/lucide-react.mjs";
import "../_libs/zod.mjs";
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
import "../_libs/tanstack__query-db-collection.mjs";
import "../_libs/tanstack__db.mjs";
import "../_libs/tanstack__db-ivm.mjs";
import "../_libs/fractional-indexing.mjs";
import "../_libs/tanstack__react-db.mjs";
function StatusBadge({
  status
}) {
  const color = status === "error" ? "destructive" : "foregroundMuted";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color, children: status.toUpperCase() });
}
function TracesPage() {
  const {
    projectId
  } = Route$5.useParams();
  const {
    data: traces
  } = useTracesCollection(projectId);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Container, { className: "py-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(TableWithHeader, { title: "Traces", table: !traces ? /* @__PURE__ */ jsxRuntimeExports.jsx(TableSkeleton, { cols: 8, rows: 5 }) : traces.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(TableBlankSlate, { description: "No traces found for this project." }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(Table, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Name" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Status" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Spans" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Models" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Tokens (in/out)" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Cost" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Duration" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Start Time" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableBody, { children: traces.map((trace) => /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/projects/$projectId/traces/$traceId/spans", params: {
        projectId,
        traceId: trace.traceId
      }, className: "underline", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: trace.rootSpanName || trace.traceId.slice(0, 8) }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: trace.status }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H5, { children: [
        formatCount(trace.spanCount),
        trace.errorCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H6, { color: "destructive", children: [
          " (",
          trace.errorCount,
          " err)"
        ] })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: trace.models.join(", ") || "—" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H5, { children: [
        formatCount(trace.tokensInput),
        " / ",
        formatCount(trace.tokensOutput)
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: formatPrice(trace.costTotalMicrocents / 1e8) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: formatDuration(trace.durationNs) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: new Date(trace.startTime).toLocaleString() }) })
    ] }, trace.traceId)) })
  ] }) }) });
}
export {
  TracesPage as component
};
