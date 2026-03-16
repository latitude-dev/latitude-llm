import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { B as Button, I as Icon } from "./router-DWBQ1rk2.mjs";
import { C as Check, g as Clipboard } from "../_libs/lucide-react.mjs";
function CopyButton({ value, className }) {
  const [copied, setCopied] = reactExports.useState(false);
  const timeoutRef = reactExports.useRef(null);
  const handleCopy = reactExports.useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2e3);
  }, [value]);
  reactExports.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { flat: true, variant: "ghost", size: "icon", onClick: handleCopy, className, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: copied ? Check : Clipboard, size: "sm", color: copied ? "success" : "foregroundMuted" }) });
}
export {
  CopyButton as C
};
