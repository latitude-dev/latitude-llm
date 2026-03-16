import { r as reactExports, j as jsxRuntimeExports } from "./_libs/react.mjs";
import { J as Route$6, T as Text2, B as Button, I as Icon } from "./_ssr/router-DWBQ1rk2.mjs";
import { u as useProjectsCollection, e as extractLeadingEmoji } from "./_ssr/projects.collection-9hUS36A_.mjs";
import { O as Outlet, e as useRouterState, L as Link } from "./_libs/tanstack__react-router.mjs";
import { m as PanelLeft, n as PanelLeftClose, o as MessageSquareText, p as Link2Off, q as ShieldAlert, H as History, r as ChevronsUp, s as ChevronDown, a as ChevronRight } from "./_libs/lucide-react.mjs";
import { e as eq } from "./_libs/tanstack__db.mjs";
import "./_libs/papaparse.mjs";
import "stream";
import "./_libs/tanstack__router-core.mjs";
import "./_libs/tiny-invariant.mjs";
import "./_libs/tanstack__history.mjs";
import "node:stream/web";
import "node:stream";
import "./_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "./_ssr/index-D2KejSDZ.mjs";
import "./_ssr/index.mjs";
import "node:async_hooks";
import "./_libs/tiny-warning.mjs";
import "./_libs/isbot.mjs";
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
import "./_libs/effect.mjs";
import "./_libs/tanstack__query-core.mjs";
import "./_libs/tanstack__react-query.mjs";
import "./_ssr/middlewares-BgvwNBR1.mjs";
import "./_libs/tanstack__query-db-collection.mjs";
import "./_libs/tanstack__react-db.mjs";
import "./_libs/tanstack__db-ivm.mjs";
import "./_libs/fractional-indexing.mjs";
function ProjectEmoji({
  name
}) {
  const [emoji] = extractLeadingEmoji(name);
  if (!emoji) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-6 h-6 rounded-lg bg-white border border-border flex items-center justify-center shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm leading-none", children: emoji }) });
}
function NavItem({
  icon,
  label,
  to,
  active,
  badge,
  children,
  defaultExpanded = false,
  collapsed = false
}) {
  const [expanded, setExpanded] = reactExports.useState(defaultExpanded);
  const hasChildren = !!children && !collapsed;
  const chevron = hasChildren ? expanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "h-4 w-4 text-muted-foreground shrink-0" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "h-4 w-4 text-muted-foreground shrink-0" }) : null;
  const rowContent = /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex items-center gap-2 rounded-lg cursor-pointer transition-colors ${collapsed ? "justify-center w-10 h-10 mx-auto" : "px-2 py-2"} ${active ? "bg-accent/10" : "hover:bg-muted"}`, title: collapsed ? label : void 0, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon, size: "sm", className: active ? "text-accent-foreground" : "text-muted-foreground" }),
    !collapsed && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5M, { color: active ? "accentForeground" : "foregroundMuted", ellipsis: true, className: "flex-1 min-w-0", children: label }),
      badge !== void 0 && badge > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-destructive-muted border border-destructive/10", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronsUp, { className: "h-3 w-3 text-destructive" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "destructive", weight: "medium", children: badge })
      ] }),
      to ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        setExpanded((v) => !v);
      }, className: "shrink-0", children: chevron }) : chevron
    ] })
  ] });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col", children: [
    to ? /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to, className: "block", children: rowContent }) : /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => hasChildren && setExpanded((v) => !v), className: "w-full text-left", children: rowContent }),
    hasChildren && expanded && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col pl-6 gap-0.5 pt-0.5", children })
  ] });
}
function NavChild({
  label,
  to
}) {
  const content = /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-2 py-2 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer transition-colors", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5M, { color: "foregroundMuted", ellipsis: true, children: label }) });
  return to ? /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to, className: "block", children: content }) : content;
}
function ProjectSidebar({
  projectId,
  collapsed,
  onToggleCollapse
}) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const {
    data: project
  } = useProjectsCollection((projects) => projects.where(({
    project: project2
  }) => eq(project2.id, projectId)).findOne(), [projectId]);
  const isTracesActive = pathname === `/projects/${projectId}` || pathname === `/projects/${projectId}/` || pathname.startsWith(`/projects/${projectId}/traces`);
  const isIssuesActive = pathname.startsWith(`/projects/${projectId}/issues`);
  const isDatasetsActive = pathname.startsWith(`/projects/${projectId}/datasets`);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("aside", { className: `shrink-0 border-r border-border flex flex-col h-full transition-all duration-200 ${collapsed ? "w-16" : "w-[280px]"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col shrink-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex items-center gap-3 p-4 border-b border-border ${collapsed ? "justify-center" : ""}`, children: [
      !collapsed && /* @__PURE__ */ jsxRuntimeExports.jsx(ProjectEmoji, { name: project?.name ?? "" }),
      !collapsed && /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5M, { ellipsis: true, className: "flex-1 min-w-0", children: project ? extractLeadingEmoji(project.name)[1] : "…" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", size: "icon", flat: true, onClick: onToggleCollapse, className: "h-8 w-8 shrink-0", title: collapsed ? "Expand sidebar" : "Collapse sidebar", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: collapsed ? PanelLeft : PanelLeftClose, size: "sm", color: "foregroundMuted" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("nav", { className: `p-4 flex flex-col gap-1 ${collapsed ? "items-center" : ""}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(NavItem, { icon: MessageSquareText, label: "Traces", to: `/projects/${projectId}`, active: isTracesActive, collapsed }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(NavItem, { icon: Link2Off, label: "Annotation queues", defaultExpanded: false, collapsed, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(NavChild, { label: "Another queue" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(NavChild, { label: "Cute queue" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(NavItem, { icon: ShieldAlert, label: "Issues", to: `/projects/${projectId}/issues`, active: isIssuesActive, collapsed }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(NavItem, { icon: History, label: "Datasets", to: `/projects/${projectId}/datasets`, active: isDatasetsActive, collapsed })
    ] })
  ] }) });
}
function ProjectLayout() {
  const {
    projectId
  } = Route$6.useParams();
  const [sidebarCollapsed, setSidebarCollapsed] = reactExports.useState(false);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(ProjectSidebar, { projectId, collapsed: sidebarCollapsed, onToggleCollapse: () => setSidebarCollapsed((v) => !v) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "flex-1 min-w-0 overflow-y-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Outlet, {}) })
  ] });
}
export {
  ProjectLayout as component
};
