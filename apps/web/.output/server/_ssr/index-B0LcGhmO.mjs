import { j as jsxRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { k as Route$c, l as TableWithHeader, m as TableBlankSlate, T as Text2, b as Input, B as Button, n as Table, o as TableHeader, p as TableRow, q as TableHead, r as TableBody, s as TableCell, t as getQueryClient, u as useToast } from "./router-DWBQ1rk2.mjs";
import { C as Container } from "./container-CyYjdg0j.mjs";
import { D as DropdownMenu } from "./dropdown-menu-CcNp2aTO.mjs";
import { F as FormWrapper } from "./form-wrapper-D9-NFgN4.mjs";
import { M as Modal, C as CloseTrigger } from "./modal-B5gjEbyd.mjs";
import { T as TableSkeleton } from "./table-skeleton-D2NW79t6.mjs";
import { u as useProjectsCollection, d as deleteProject, c as createProject, e as extractLeadingEmoji, a as updateProject } from "./projects.collection-9hUS36A_.mjs";
import { u as useForm } from "../_libs/tanstack__react-form.mjs";
import { d as useRouter, L as Link } from "../_libs/tanstack__react-router.mjs";
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
import "../_libs/tanstack__form-core.mjs";
import "../_libs/tanstack__store.mjs";
import "../_libs/tanstack__pacer-lite.mjs";
import "../_libs/@tanstack/devtools-event-client+[...].mjs";
import "../_libs/tanstack__react-store.mjs";
import "../_libs/use-sync-external-store.mjs";
function invalidateProjects() {
  void getQueryClient().invalidateQueries({
    queryKey: ["projects"]
  });
}
function ProjectTitle({
  name,
  projectId
}) {
  const [emoji, title] = extractLeadingEmoji(name);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
    emoji && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-w-8 h-8 rounded-lg bg-muted flex items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: emoji }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/projects/$projectId", params: {
      projectId
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { weight: "medium", children: title }) })
  ] });
}
function ProjectsTable({
  projects
}) {
  const [projectToRename, setProjectToRename] = reactExports.useState(null);
  const router = useRouter();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Table, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { verticalPadding: true, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { className: "w-44", children: "Issues" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { className: "w-44", children: "Datasets" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { className: "w-44", children: "Traces (7D)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, {})
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableBody, { children: projects.map((project) => /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { verticalPadding: true, className: "cursor-pointer", onClick: () => void router.navigate({
        to: "/projects/$projectId",
        params: {
          projectId: project.id
        }
      }), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ProjectTitle, { name: project.name, projectId: project.id }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { className: "w-44", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: "—" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { className: "w-44", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: "—" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { className: "w-44", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: "—" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { preventDefault: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenu, { options: [{
          label: "Rename",
          onClick: () => {
            setProjectToRename(project);
          }
        }, {
          label: "Delete",
          type: "destructive",
          onClick: () => {
            void deleteProject({
              data: {
                id: project.id
              }
            }).then(() => {
              invalidateProjects();
            });
          }
        }], side: "bottom", align: "end", triggerButtonProps: {
          className: "border-none justify-end cursor-pointer"
        } }) })
      ] }, project.id)) })
    ] }),
    projectToRename && /* @__PURE__ */ jsxRuntimeExports.jsx(RenameProjectModal, { project: projectToRename, onClose: () => setProjectToRename(null) })
  ] });
}
function RenameProjectModal({
  project,
  onClose
}) {
  const {
    toast
  } = useToast();
  const form = useForm({
    defaultValues: {
      name: project.name
    },
    onSubmit: async ({
      value
    }) => {
      await updateProject({
        data: {
          id: project.id,
          name: value.name
        }
      });
      invalidateProjects();
      toast({
        title: "Success",
        description: `Project renamed to "${value.name}".`
      });
      onClose();
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Modal, { open: true, dismissible: true, onOpenChange: onClose, title: "Rename Project", description: "Change the name of this project.", footer: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(CloseTrigger, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", onClick: () => {
      void form.handleSubmit();
    }, children: "Rename Project" })
  ] }), children: /* @__PURE__ */ jsxRuntimeExports.jsx("form", { onSubmit: (e) => {
    e.preventDefault();
    void form.handleSubmit();
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(FormWrapper, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(form.Field, { name: "name", children: (field) => /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { required: true, type: "text", label: "Name", value: field.state.value, onChange: (e) => field.handleChange(e.target.value), placeholder: "New project name" }) }) }) }) });
}
function CreateProjectModal({
  open,
  onClose
}) {
  const form = useForm({
    defaultValues: {
      name: ""
    },
    onSubmit: async ({
      value
    }) => {
      await createProject({
        data: {
          name: value.name
        }
      });
      invalidateProjects();
      onClose();
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Modal, { open, dismissible: true, onOpenChange: onClose, title: "Create Project", description: "Create a new project to start adding your prompts.", footer: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(CloseTrigger, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", onClick: () => {
      void form.handleSubmit();
    }, children: "Create Project" })
  ] }), children: /* @__PURE__ */ jsxRuntimeExports.jsx("form", { onSubmit: (e) => {
    e.preventDefault();
    void form.handleSubmit();
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(FormWrapper, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(form.Field, { name: "name", children: (field) => /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { required: true, type: "text", label: "Name", value: field.state.value, onChange: (e) => field.handleChange(e.target.value), placeholder: "My awesome project" }) }) }) }) });
}
function DashboardPageContent() {
  const [createOpen, setCreateOpen] = reactExports.useState(false);
  const {
    organizationName
  } = Route$c.useRouteContext();
  const {
    data,
    isLoading
  } = useProjectsCollection();
  const projects = data ?? [];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(CreateProjectModal, { open: createOpen, onClose: () => setCreateOpen(false) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableWithHeader, { title: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H4, { color: "foregroundMuted", display: "inline", children: [
        "Projects in",
        " "
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H4, { weight: "bold", display: "inline", children: organizationName })
    ] }), actions: /* @__PURE__ */ jsxRuntimeExports.jsx(TableWithHeader.Button, { flat: true, onClick: () => setCreateOpen(true), children: "New project" }), table: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx(TableSkeleton, { cols: 5, rows: 3 }) : projects.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(ProjectsTable, { projects }) : /* @__PURE__ */ jsxRuntimeExports.jsx(TableBlankSlate, { description: "There are no projects yet. Create one to start adding your prompts.", link: /* @__PURE__ */ jsxRuntimeExports.jsx(TableBlankSlate.Button, { onClick: () => setCreateOpen(true), children: "Create your first project" }) }) })
  ] });
}
function DashboardPage() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Container, { className: "pt-14", children: /* @__PURE__ */ jsxRuntimeExports.jsx(DashboardPageContent, {}) });
}
export {
  DashboardPage as component
};
