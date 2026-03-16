import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as LatitudeLogo } from "./index-CgoGWwjD.mjs";
import { G as Route$b, I as Icon, T as Text2, B as Button } from "./router-DWBQ1rk2.mjs";
import { u as useNavigate } from "../_libs/tanstack__react-router.mjs";
import { g as getAuthIntentInfo, b as completeAuthIntent } from "./auth.functions-6NDOOGrI.mjs";
import { i as CircleX, j as CircleCheckBig, L as LoaderCircle } from "../_libs/lucide-react.mjs";
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
function AuthConfirmPage() {
  const {
    authIntentId,
    cliSession
  } = Route$b.useSearch();
  const navigate = useNavigate();
  const [state, setState] = reactExports.useState({
    step: "loading"
  });
  const [name, setName] = reactExports.useState("");
  reactExports.useEffect(() => {
    if (!authIntentId) {
      void navigate({
        to: "/"
      });
      return;
    }
    getAuthIntentInfo({
      data: {
        intentId: authIntentId
      }
    }).then((info) => {
      if (info.needsName) {
        setState({
          step: "name-form",
          intentInfo: info
        });
      } else {
        setState({
          step: "completing"
        });
        return completeAndRedirect();
      }
    }).catch((err) => {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : "Failed to load"
      });
    });
  }, [authIntentId, navigate]);
  const completeAndRedirect = async (userName) => {
    return completeAuthIntent({
      data: {
        intentId: authIntentId,
        name: userName
      }
    }).then(() => {
      setState({
        step: "completed"
      });
      if (cliSession) {
        void navigate({
          to: "/auth/cli",
          search: {
            session: cliSession
          }
        });
      } else {
        setTimeout(() => {
          void navigate({
            to: "/"
          });
        }, 2e3);
      }
    }).catch((err) => {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : "Failed to complete authentication"
      });
    });
  };
  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setState({
      step: "completing"
    });
    void completeAndRedirect(name.trim());
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col items-center justify-center min-h-screen p-4 bg-background", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center gap-6 max-w-[22rem] w-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(LatitudeLogo, {}),
    state.step === "error" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: CircleX, className: "h-6 w-6 text-destructive" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { align: "center", children: "Something went wrong" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", align: "center", children: state.message })
    ] }) : state.step === "completed" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-full bg-primary/10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: CircleCheckBig, className: "h-6 w-6 text-primary" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { align: "center", children: "You're in!" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", align: "center", children: cliSession ? "Redirecting to CLI authorization..." : "In a few seconds you will be redirected to your workspace." })
    ] }) : state.step === "name-form" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-4 w-full", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { align: "center", children: "Welcome to Latitude" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", align: "center", children: `You've been invited to join ${state.intentInfo.organizationName ?? "a workspace"}. Enter your name to continue.` }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleNameSubmit, className: "flex flex-col gap-4 w-full", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { htmlFor: "name", className: "flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { weight: "medium", children: "Name" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { id: "name", type: "text", required: true, value: name, onChange: (e) => setName(e.target.value), placeholder: "Your name", className: "flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "full", type: "submit", disabled: !name.trim(), children: "Join workspace" })
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-full bg-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: LoaderCircle, className: "h-6 w-6 text-muted-foreground animate-spin" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { align: "center", children: "Setting up your workspace" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", align: "center", children: "Please wait while we complete your authentication..." })
    ] })
  ] }) });
}
export {
  AuthConfirmPage as component
};
