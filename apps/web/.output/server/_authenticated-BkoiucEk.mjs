import { j as jsxRuntimeExports } from "./_libs/react.mjs";
import { L as LatitudeLogo } from "./_ssr/index-CgoGWwjD.mjs";
import { j as Route$d, D as DropdownMenuTrigger } from "./_ssr/router-DWBQ1rk2.mjs";
import { D as DropdownMenu } from "./_ssr/dropdown-menu-CcNp2aTO.mjs";
import { u as useProjectsCollection, e as extractLeadingEmoji } from "./_ssr/projects.collection-9hUS36A_.mjs";
import { O as Outlet, d as useRouter, e as useRouterState, L as Link } from "./_libs/tanstack__react-router.mjs";
import { a as authClient } from "./_ssr/auth-client-eZt5gsJf.mjs";
import { h as ChevronsUpDown } from "./_libs/lucide-react.mjs";
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
function UserAvatar({
  name
}) {
  const initials = name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-6 h-6 rounded-full bg-primary flex items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium text-primary-foreground leading-none", children: initials }) });
}
function ProjectBreadcrumb({
  projectId
}) {
  const {
    data: project
  } = useProjectsCollection((projects) => projects.where(({
    project: project2
  }) => eq(project2.id, projectId)).findOne(), [projectId]);
  const {
    data: allProjects
  } = useProjectsCollection();
  const hasMultipleProjects = (allProjects?.length ?? 0) > 1;
  if (!project) return null;
  const [emoji, title] = extractLeadingEmoji(project.name);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground text-sm select-none", children: "/" }),
    hasMultipleProjects ? /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", className: "flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors", children: [
      emoji && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: emoji }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-muted-foreground", children: title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronsUpDown, { className: "h-4 w-4 text-muted-foreground" })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-sm font-medium text-muted-foreground px-2 py-1", children: [
      emoji && `${emoji} `,
      title
    ] })
  ] });
}
function NavHeader() {
  const {
    user,
    organizationName,
    hasMultipleOrgs
  } = Route$d.useRouteContext();
  const router = useRouter();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const projectMatch = pathname.match(/\/projects\/([^/]+)/);
  const currentProjectId = projectMatch?.[1] ?? null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "w-full bg-background border-b border-border h-12 flex items-center px-4 shrink-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LatitudeLogo, { className: "h-5 w-5" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground text-sm select-none", children: "/" }),
      hasMultipleOrgs ? /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", className: "flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-foreground", children: organizationName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronsUpDown, { className: "h-4 w-4 text-muted-foreground" })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-foreground px-2 py-1", children: organizationName }),
      currentProjectId && /* @__PURE__ */ jsxRuntimeExports.jsx(ProjectBreadcrumb, { projectId: currentProjectId })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
      false,
      /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: "https://docs.latitude.so", target: "_blank", rel: "noopener noreferrer", className: "text-sm text-foreground hover:text-muted-foreground transition-colors", children: "Docs" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/settings", className: "text-sm text-foreground hover:text-muted-foreground transition-colors", children: "Settings" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenu, { side: "bottom", align: "end", options: [{
        label: "Log out",
        type: "destructive",
        onClick: () => {
          void authClient.signOut().then(() => {
            void router.navigate({
              to: "/login"
            });
          });
        }
      }], trigger: () => /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "cursor-pointer", children: /* @__PURE__ */ jsxRuntimeExports.jsx(UserAvatar, { name: user.name ?? user.email }) }) }) })
    ] })
  ] });
}
function AuthenticatedLayout() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-screen overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(NavHeader, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "w-full flex-grow min-h-0 h-full relative overflow-y-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Outlet, {}) })
  ] });
}
export {
  AuthenticatedLayout as component
};
