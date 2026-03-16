import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as LatitudeLogo, G as GoogleIcon, a as GitHubIcon } from "./index-CgoGWwjD.mjs";
import { a as Route$f, I as Icon, T as Text2, B as Button } from "./router-DWBQ1rk2.mjs";
import { u as useNavigate, L as Link } from "../_libs/tanstack__react-router.mjs";
import { a as createLoginIntent } from "./auth.functions-6NDOOGrI.mjs";
import { W as WEB_BASE_URL, a as authClient, A as AUTH_BASE_PATH } from "./auth-client-eZt5gsJf.mjs";
import { p as parseServerError } from "./middlewares-BgvwNBR1.mjs";
import { c as Mail, d as CircleAlert } from "../_libs/lucide-react.mjs";
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
import "./auth.types-BkojwMno.mjs";
function LoginPage() {
  const {
    cliSession
  } = Route$f.useSearch();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = reactExports.useState(false);
  const [error, setError] = reactExports.useState();
  const [isSent, setIsSent] = reactExports.useState(false);
  const [email, setEmail] = reactExports.useState("");
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    const formData = new FormData(e.currentTarget);
    const email2 = String(formData.get("email") ?? "");
    setEmail(email2);
    setIsLoading(true);
    setError(void 0);
    try {
      const {
        intentId
      } = await createLoginIntent({
        data: {
          email: email2
        }
      });
      const callbackURL = cliSession ? `${WEB_BASE_URL}/auth/confirm?authIntentId=${intentId}&cliSession=${encodeURIComponent(cliSession)}` : `${WEB_BASE_URL}/auth/confirm?authIntentId=${intentId}`;
      const {
        error: signInError
      } = await authClient.signIn.magicLink({
        email: email2,
        callbackURL
      });
      if (signInError) {
        throw new Error(signInError.message ?? "Failed to send magic link");
      }
      setIsSent(true);
    } catch (err) {
      const {
        _tag,
        message
      } = parseServerError(err);
      if (_tag === "LoginUserNotFoundError") {
        navigate({
          to: "/signup",
          search: {
            reason: "no-account",
            cliSession
          }
        });
        return;
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };
  const submitSocialSignIn = (provider) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${AUTH_BASE_PATH}/sign-in/social`;
    const providerInput = document.createElement("input");
    providerInput.type = "hidden";
    providerInput.name = "provider";
    providerInput.value = provider;
    const callbackUrlInput = document.createElement("input");
    callbackUrlInput.type = "hidden";
    callbackUrlInput.name = "callbackURL";
    callbackUrlInput.value = WEB_BASE_URL;
    form.append(providerInput, callbackUrlInput);
    document.body.appendChild(form);
    form.submit();
  };
  const handleGoogleClick = () => {
    submitSocialSignIn("google");
  };
  const handleGitHubClick = () => {
    submitSocialSignIn("github");
  };
  if (isSent) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col items-center justify-center min-h-screen p-4 bg-background", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center gap-y-6 max-w-[22rem] w-full", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LatitudeLogo, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-4 w-full", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-full bg-primary/10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: Mail, className: "h-6 w-6 text-primary" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { align: "center", children: "Check your email" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H5, { color: "foregroundMuted", align: "center", children: [
          "We sent a magic link to ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: email })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", align: "center", children: "Click the link in the email to sign in. The link will expire in 1 hour." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", className: "w-full", onClick: () => {
          setIsSent(false);
          setEmail("");
        }, children: "Use a different email" })
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col items-center justify-center min-h-screen p-4 bg-background", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-y-6 max-w-[22rem] w-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center gap-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LatitudeLogo, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col items-center justify-center gap-y-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { align: "center", children: "Welcome to Latitude" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 rounded-xl overflow-hidden shadow-none bg-muted/50 border border-border p-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "flex flex-col gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { htmlFor: "email", className: "flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { weight: "medium", children: "Email" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { id: "email", name: "email", type: "email", placeholder: "Ex.: jon@example.com", required: true, autoComplete: "email", "data-autofocus": "true", className: "flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" })
        ] }),
        error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm text-destructive", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: CircleAlert, className: "h-4 w-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "destructive", children: error })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "full", type: "submit", disabled: isLoading, className: "relative w-full inline-flex items-center justify-center rounded-lg text-sm font-semibold leading-5 text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)] active:translate-y-[1px] active:shadow-none transition-all", children: isLoading ? "Sending..." : "Login" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 h-[1px] bg-border" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "bg-muted/50 px-2 text-xs leading-4 text-muted-foreground", children: "Or" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 h-[1px] bg-border" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "ghost", onClick: handleGoogleClick, disabled: isLoading, className: "relative w-full inline-flex items-center justify-center rounded-lg text-sm font-medium leading-5 text-foreground bg-background border border-input hover:bg-muted disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 transition-colors", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(GoogleIcon, { className: "mr-2" }),
          "Continue with Google"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "lg", variant: "ghost", onClick: handleGitHubClick, disabled: isLoading, className: "relative w-full inline-flex items-center justify-center rounded-lg text-sm font-medium leading-5 text-foreground bg-background border border-input hover:bg-muted disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 transition-colors", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(GitHubIcon, { className: "mr-2" }),
          "Continue with GitHub"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center gap-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H6, { color: "foregroundMuted", align: "center", children: [
        "If you have any problem or suggestion check our",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: "https://docs.latitude.so", className: "text-accent-foreground underline hover:no-underline", target: "_blank", rel: "noopener noreferrer", children: "documentation" }),
        " ",
        "or contact us via",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: "mailto:hello@latitude.so", className: "text-accent-foreground underline hover:no-underline", children: "email" }),
        " ",
        "or",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: "https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw", className: "text-accent-foreground underline hover:no-underline", target: "_blank", rel: "noopener noreferrer", children: "Slack" }),
        "."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H6, { color: "foregroundMuted", align: "center", children: [
        "Do not have an account yet?",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/signup", search: cliSession ? {
          cliSession
        } : {}, className: "text-accent-foreground underline hover:no-underline inline-flex items-center gap-1", children: [
          "Sign up",
          /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: "h-4 w-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", strokeWidth: "2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("title", { children: "Arrow right" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 12h14M12 5l7 7-7 7" })
          ] })
        ] })
      ] })
    ] })
  ] }) });
}
export {
  LoginPage as component
};
