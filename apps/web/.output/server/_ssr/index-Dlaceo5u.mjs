import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { M as Route$3, t as getQueryClient, l as TableWithHeader, m as TableBlankSlate, B as Button, n as Table, o as TableHeader, p as TableRow, q as TableHead, r as TableBody, s as TableCell, T as Text2 } from "./router-DWBQ1rk2.mjs";
import { C as Container } from "./container-CyYjdg0j.mjs";
import { T as TableSkeleton } from "./table-skeleton-D2NW79t6.mjs";
import { r as relativeTime } from "./relativeTime-CCHfweVn.mjs";
import { u as useNavigate, L as Link } from "../_libs/tanstack__react-router.mjs";
import { u as useDatasetsCollection, c as createDatasetMutation } from "./datasets.collection-DCWne5hJ.mjs";
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
function DatasetsTable({
  datasets,
  projectId
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Table, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { verticalPadding: true, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Name" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Version" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Created" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableBody, { children: datasets.map((dataset) => /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { verticalPadding: true, className: "cursor-pointer", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/projects/$projectId/datasets/$datasetId", params: {
        projectId,
        datasetId: dataset.id
      }, className: "contents", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: dataset.name }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/projects/$projectId/datasets/$datasetId", params: {
        projectId,
        datasetId: dataset.id
      }, className: "contents", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: dataset.currentVersion }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/projects/$projectId/datasets/$datasetId", params: {
        projectId,
        datasetId: dataset.id
      }, className: "contents", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: relativeTime(dataset.createdAt) }) }) })
    ] }, dataset.id)) })
  ] });
}
function DatasetsPage() {
  const {
    projectId
  } = Route$3.useParams();
  const navigate = useNavigate();
  const datasetsCollection = useDatasetsCollection(projectId);
  const datasets = datasetsCollection.data ?? [];
  const isLoading = !datasetsCollection.data;
  const [creating, setCreating] = reactExports.useState(false);
  const handleCreate = reactExports.useCallback(async () => {
    setCreating(true);
    try {
      const dataset = await createDatasetMutation({
        data: {
          projectId,
          name: `Dataset ${(/* @__PURE__ */ new Date()).toLocaleString()}`
        }
      });
      getQueryClient().invalidateQueries({
        queryKey: ["datasets", projectId]
      });
      navigate({
        to: "/projects/$projectId/datasets/$datasetId",
        params: {
          projectId,
          datasetId: dataset.id
        }
      });
    } finally {
      setCreating(false);
    }
  }, [projectId, navigate]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Container, { className: "pt-14", children: /* @__PURE__ */ jsxRuntimeExports.jsx(TableWithHeader, { title: "Datasets", actions: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: handleCreate, disabled: creating, isLoading: creating, children: "+ Dataset" }), table: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx(TableSkeleton, { cols: 3, rows: 3 }) : datasets.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(DatasetsTable, { datasets, projectId }) : /* @__PURE__ */ jsxRuntimeExports.jsx(TableBlankSlate, { description: "There are no datasets yet." }) }) });
}
export {
  DatasetsPage as component
};
