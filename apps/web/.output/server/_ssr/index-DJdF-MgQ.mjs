import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { X as Route$1, B as Button, T as Text2, l as TableWithHeader, m as TableBlankSlate, n as Table, o as TableHeader, p as TableRow, q as TableHead, r as TableBody, s as TableCell } from "./router-DWBQ1rk2.mjs";
import { C as Container } from "./container-CyYjdg0j.mjs";
import { T as TableSkeleton } from "./table-skeleton-D2NW79t6.mjs";
import { aC as formatPrice } from "./index-D2KejSDZ.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { a as useSpansByTraceCollection } from "./spans.collection-Ov7aCc-C.mjs";
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
function TraceSpansPage() {
  const {
    projectId,
    traceId
  } = Route$1.useParams();
  const {
    data: spans
  } = useSpansByTraceCollection(traceId);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Container, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-6 py-8", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/projects/$projectId", params: {
        projectId
      }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: "Back to traces" }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H2, { children: "Spans" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H6, { color: "foregroundMuted", children: [
          "Trace ",
          traceId.slice(0, 8),
          "..."
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableWithHeader, { title: "Spans", table: !spans ? /* @__PURE__ */ jsxRuntimeExports.jsx(TableSkeleton, { cols: 9, rows: 5 }) : spans.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(TableBlankSlate, { description: "No spans found for this trace." }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(Table, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Span ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Parent" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Kind" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Provider" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Model" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Tokens (in/out)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Cost" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableBody, { children: spans.map((span) => /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/projects/$projectId/traces/$traceId/spans/$spanId", params: {
          projectId,
          traceId: span.traceId,
          spanId: span.spanId
        }, className: "underline", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: span.name }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H5, { color: "foregroundMuted", children: [
          span.spanId.slice(0, 8),
          "..."
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: span.parentSpanId ? `${span.parentSpanId.slice(0, 8)}...` : "root" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: span.kind.toUpperCase() }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: span.statusCode === "error" ? "destructive" : "foregroundMuted", children: span.statusCode.toUpperCase() }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: span.provider || "—" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: span.model || "—" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H5, { children: [
          span.tokensInput,
          " / ",
          span.tokensOutput
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: formatPrice(span.costTotalMicrocents / 1e8) }) })
      ] }, `${span.traceId}-${span.spanId}`)) })
    ] }) })
  ] }) });
}
export {
  TraceSpansPage as component
};
