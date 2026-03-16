import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { Y as Route, T as Text2, B as Button } from "./router-DWBQ1rk2.mjs";
import { C as Container } from "./container-CyYjdg0j.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { b as useSpanDetail } from "./spans.collection-Ov7aCc-C.mjs";
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
import "./index-D2KejSDZ.mjs";
import "./index.mjs";
import "node:async_hooks";
import "../_libs/tiny-warning.mjs";
import "../_libs/isbot.mjs";
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
import "../_libs/effect.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
import "./middlewares-BgvwNBR1.mjs";
import "../_libs/lucide-react.mjs";
import "../_libs/tanstack__query-db-collection.mjs";
import "../_libs/tanstack__db.mjs";
import "../_libs/tanstack__db-ivm.mjs";
import "../_libs/fractional-indexing.mjs";
import "../_libs/tanstack__react-db.mjs";
function Field({
  label,
  value
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: value || "—" })
  ] });
}
function JsonBlock({
  label,
  value
}) {
  if (!value) return null;
  let formatted;
  try {
    formatted = JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    formatted = value;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "overflow-auto rounded bg-muted p-3 text-xs", children: formatted })
  ] });
}
function DataBlock({
  label,
  data
}) {
  const isEmpty = Array.isArray(data) ? data.length === 0 : Object.keys(data).length === 0;
  if (isEmpty) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "overflow-auto rounded bg-muted p-3 text-xs", children: JSON.stringify(data, null, 2) })
  ] });
}
function SpanDetailPage() {
  const {
    projectId,
    traceId,
    spanId
  } = Route.useParams();
  const {
    data: span,
    isLoading,
    error
  } = useSpanDetail({
    traceId,
    spanId
  });
  if (error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(Container, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 py-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H4, { color: "destructive", children: error instanceof Error ? error.message : String(error) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/projects/$projectId/traces/$traceId/spans", params: {
        projectId,
        traceId
      }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", children: "Back to spans" }) })
    ] }) });
  }
  if (isLoading || !span) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(Container, { children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H4, { children: "Loading..." }) }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Container, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-6 py-8", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/projects/$projectId/traces/$traceId/spans", params: {
        projectId,
        traceId
      }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: "Back to spans" }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H2, { children: span.name })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: "Identity" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Trace ID", value: span.traceId }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Span ID", value: span.spanId }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Parent Span ID", value: span.parentSpanId }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Session ID", value: span.sessionId }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Organization ID", value: span.organizationId }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Project ID", value: span.projectId }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "API Key ID", value: span.apiKeyId })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: "Metadata" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Kind", value: span.kind.toUpperCase() }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Status", value: span.statusCode.toUpperCase() }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Status Message", value: span.statusMessage }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Service Name", value: span.serviceName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Error Type", value: span.errorType }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Start Time", value: span.startTime }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "End Time", value: span.endTime }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Ingested At", value: span.ingestedAt })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: "GenAI" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Operation", value: span.operation }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Provider", value: span.provider }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Model", value: span.model }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Response Model", value: span.responseModel }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Response ID", value: span.responseId }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Finish Reasons", value: span.finishReasons.join(", ") })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: "Tokens" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Input", value: String(span.tokensInput) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Output", value: String(span.tokensOutput) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Cache Read", value: String(span.tokensCacheRead) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Cache Create", value: String(span.tokensCacheCreate) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Reasoning", value: String(span.tokensReasoning) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: "Cost (microcents)" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Input", value: String(span.costInputMicrocents) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Output", value: String(span.costOutputMicrocents) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Total", value: String(span.costTotalMicrocents) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Estimated", value: span.costIsEstimated ? "Yes" : "No" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: "Content Payloads" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DataBlock, { label: "Input Messages", data: span.inputMessages }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DataBlock, { label: "Output Messages", data: span.outputMessages }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(JsonBlock, { label: "System Instructions", value: span.systemInstructions }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(JsonBlock, { label: "Tool Definitions", value: span.toolDefinitions })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: "Attributes" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DataBlock, { label: "String Attributes", data: span.attrString }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DataBlock, { label: "Int Attributes", data: span.attrInt }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DataBlock, { label: "Float Attributes", data: span.attrFloat }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DataBlock, { label: "Bool Attributes", data: span.attrBool }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DataBlock, { label: "Resource", data: span.resourceString })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: "Scope" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Scope Name", value: span.scopeName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Scope Version", value: span.scopeVersion })
      ] }),
      span.eventsJson && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: "Events" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(JsonBlock, { label: "Events JSON", value: span.eventsJson })
      ] }),
      span.linksJson && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: "Links" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(JsonBlock, { label: "Links JSON", value: span.linksJson })
      ] }),
      span.tags.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: "Tags" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: span.tags.join(", ") })
      ] })
    ] })
  ] }) });
}
export {
  SpanDetailPage as component
};
