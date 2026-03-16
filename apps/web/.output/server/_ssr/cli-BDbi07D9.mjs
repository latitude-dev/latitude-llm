import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as LatitudeLogo } from "./index-CgoGWwjD.mjs";
import { H as Route$a, I as Icon, T as Text2, B as Button } from "./router-DWBQ1rk2.mjs";
import { u as useNavigate } from "../_libs/tanstack__react-router.mjs";
import { e as exchangeCliSession } from "./auth.functions-6NDOOGrI.mjs";
import { i as CircleX, j as CircleCheckBig, L as LoaderCircle, T as Terminal } from "../_libs/lucide-react.mjs";
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
import "./auth.types-BkojwMno.mjs";
function CliAuthPage() {
  const {
    session: sessionToken
  } = Route$a.useSearch();
  const navigate = useNavigate();
  const [state, setState] = reactExports.useState({
    step: "confirm"
  });
  if (!sessionToken) {
    void navigate({
      to: "/"
    });
    return null;
  }
  const handleAuthorize = async () => {
    setState({
      step: "authorizing"
    });
    try {
      await exchangeCliSession({
        data: {
          sessionToken
        }
      });
      setState({
        step: "authorized"
      });
    } catch (err) {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : "Failed to authorize CLI"
      });
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col items-center justify-center min-h-screen p-4 bg-background", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center gap-6 max-w-[22rem] w-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(LatitudeLogo, {}),
    state.step === "error" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: CircleX, className: "h-6 w-6 text-destructive" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { align: "center", children: "Authorization failed" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", align: "center", children: state.message }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", onClick: () => setState({
        step: "confirm"
      }), children: "Try again" })
    ] }) : state.step === "authorized" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-full bg-primary/10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: CircleCheckBig, className: "h-6 w-6 text-primary" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { align: "center", children: "CLI authorized" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", align: "center", children: "You can close this tab and return to your terminal." })
    ] }) : state.step === "authorizing" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-full bg-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: LoaderCircle, className: "h-6 w-6 text-muted-foreground animate-spin" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { align: "center", children: "Authorizing..." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-6 w-full", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-full bg-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: Terminal, className: "h-6 w-6 text-muted-foreground" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { align: "center", children: "Authorize CLI access" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", align: "center", children: "An API key will be created for your active workspace and sent to your terminal." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "full", onClick: handleAuthorize, children: "Authorize" })
    ] })
  ] }) });
}
export {
  CliAuthPage as component
};
