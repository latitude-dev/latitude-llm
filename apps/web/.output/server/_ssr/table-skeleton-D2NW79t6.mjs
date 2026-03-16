import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { n as Table, o as TableHeader, p as TableRow, q as TableHead, r as TableBody, s as TableCell, y as cn } from "./router-DWBQ1rk2.mjs";
function Skeleton({ className, animate = true, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("rounded-md bg-muted", { "animate-pulse": animate }, className), ...props });
}
function TableSkeleton({
  rows,
  cols,
  maxHeight,
  verticalPadding = false,
  animate = true
}) {
  const { data, headers } = reactExports.useMemo(() => {
    const headers2 = typeof cols === "number" ? Array.from(Array(cols).keys()) : cols;
    const data2 = Array.from({ length: rows }, (_, i) => ({ id: `row-${i}`, cells: headers2 }));
    return { data: data2, headers: headers2 };
  }, [rows, cols]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Table, { ...maxHeight !== void 0 ? { maxHeight } : {}, overflow: "overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(TableRow, { hoverable: false, children: headers.map((header) => /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: typeof header === "string" ? header : /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "w-20 h-4" }) }, header)) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableBody, { children: data.map((row) => /* @__PURE__ */ jsxRuntimeExports.jsx(TableRow, { verticalPadding, hoverable: false, children: row.cells.map((cell) => /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { className: "py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "w-full h-4", animate }) }, cell)) }, row.id)) })
  ] });
}
export {
  Skeleton as S,
  TableSkeleton as T
};
