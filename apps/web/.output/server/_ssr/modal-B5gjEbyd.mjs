import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { N as Dialog, O as DialogContent, y as cn, P as DialogHeader, Q as DialogTitle, S as DialogDescription, U as DialogFooter, V as zIndex, W as DialogClose, B as Button } from "./router-DWBQ1rk2.mjs";
function Modal({
  open,
  defaultOpen,
  onOpenChange,
  children,
  footer,
  title,
  description,
  size = "regular",
  height = "content",
  dismissible = false,
  scrollable = true,
  zIndex: zIndex$1 = "modal",
  footerAlign = "right"
}) {
  const dialogProps = {};
  if (open !== void 0) dialogProps.open = open;
  if (defaultOpen !== void 0) dialogProps.defaultOpen = defaultOpen;
  if (onOpenChange !== void 0) dialogProps.onOpenChange = onOpenChange;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { ...dialogProps, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    DialogContent,
    {
      dismissible,
      height,
      className: cn("flex flex-col", zIndex[zIndex$1], {
        "max-w-modal-sm": size === "small",
        "max-w-modal": size === "regular",
        "max-w-modal-md": size === "medium",
        "max-w-modal-lg": size === "large",
        "max-w-modal-xl": size === "xl",
        "max-w-[97.5%]": size === "full"
      }),
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col relative h-full overflow-hidden", children: [
        title || !!description ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-y-4 pb-6", children: (title || !!description) && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 pt-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogHeader, { children: [
          title && /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: title }),
          !!description && /* @__PURE__ */ jsxRuntimeExports.jsx(DialogDescription, { children: description })
        ] }) }) }) : null,
        children ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: cn("px-6", {
              "overflow-y-auto custom-scrollbar pb-6": scrollable,
              "min-h-0 flex-grow flex flex-col": !scrollable
            }),
            children
          }
        ) : null,
        footer ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: cn("px-6 border-border border-t rounded-b-2xl", {
              "bg-background-gray py-4": !!footer
            }),
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(DialogFooter, { align: footerAlign, children: footer })
          }
        ) : null
      ] })
    }
  ) });
}
const CloseTrigger = ({ children = /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", children: "Close" }) }) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(DialogClose, { asChild: true, children });
};
export {
  CloseTrigger as C,
  Modal as M
};
