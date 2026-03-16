import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { v as DropdownMenu$1, w as DropdownMenuPortal, x as DropdownMenuContent, y as cn, z as DropdownMenuLabel, A as DropdownMenuSeparator, D as DropdownMenuTrigger, B as Button, I as Icon, E as DropdownMenuItem, T as Text2 } from "./router-DWBQ1rk2.mjs";
import { E as Ellipsis } from "../_libs/lucide-react.mjs";
const TriggerButton = ({ label, variant = "outline", className: cln, ...buttonProps }) => {
  const className = cln ?? "w-8 px-1";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuTrigger, { asChild: true, className: "flex focus:outline-none cursor-pointer", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { flat: true, asChild: false, className, variant, ...buttonProps, children: label ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: label }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: Ellipsis, size: "sm", color: "foregroundMuted" }) }) });
};
function DropdownItem({
  iconProps,
  onClick,
  closeDropdown,
  onElementClick,
  type = "normal",
  label,
  disabled
}) {
  const onSelect = reactExports.useCallback(() => {
    if (disabled) return;
    onClick?.();
    closeDropdown?.();
  }, [disabled, onClick, closeDropdown]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    DropdownMenuItem,
    {
      onClick: onElementClick,
      onSelect,
      ...disabled !== void 0 ? { disabled } : {},
      className: cn("gap-2 items-center cursor-pointer", {
        "cursor-auto pointer-events-none": !onClick
      }),
      children: [
        iconProps ? /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { ...iconProps }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: type === "destructive" ? "destructive" : "foreground", children: label }) })
      ]
    }
  );
}
function DropdownMenu({
  triggerButtonProps,
  trigger,
  title,
  side,
  sideOffset,
  align,
  alignOffset,
  options,
  onOpenChange,
  controlledOpen,
  width = "normal"
}) {
  const [open, setOpen] = reactExports.useState(false);
  const closeDropdown = reactExports.useCallback(() => {
    setOpen(false);
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    DropdownMenu$1,
    {
      onOpenChange: (newOpen) => {
        onOpenChange?.(newOpen);
        setOpen(newOpen);
      },
      open: controlledOpen !== void 0 ? controlledOpen : open,
      children: [
        triggerButtonProps ? /* @__PURE__ */ jsxRuntimeExports.jsx(TriggerButton, { ...triggerButtonProps }) : trigger ? trigger({ open, setOpen }) : /* @__PURE__ */ jsxRuntimeExports.jsx(TriggerButton, {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuPortal, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          DropdownMenuContent,
          {
            ...side !== void 0 ? { side } : {},
            ...sideOffset !== void 0 ? { sideOffset } : {},
            ...align !== void 0 ? { align } : {},
            ...alignOffset !== void 0 ? { alignOffset } : {},
            className: cn({
              "w-52": width === "normal",
              "w-72": width === "wide",
              "w-96": width === "extraWide"
            }),
            children: [
              title && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuLabel, { children: title }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuSeparator, {})
              ] }),
              options.filter((option) => !option.hidden).map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownItem, { ...option, closeDropdown }, option.label))
            ]
          }
        ) })
      ]
    }
  );
}
export {
  DropdownMenu as D
};
