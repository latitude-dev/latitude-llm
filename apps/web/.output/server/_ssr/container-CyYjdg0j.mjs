import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { y as cn } from "./router-DWBQ1rk2.mjs";
function Container({
  size = "xl",
  limitMaxHeight = false,
  className,
  children
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: cn("mx-auto w-full py-6 px-4 flex flex-col gap-6", className, {
        "max-h-full": limitMaxHeight,
        "max-w-screen-xl": size === "xl",
        "max-w-screen-2xl": size === "2xl"
      }),
      children
    }
  );
}
export {
  Container as C
};
