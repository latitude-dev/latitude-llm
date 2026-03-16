import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as LatitudeLogo, G as GoogleIcon, a as GitHubIcon } from "./index-CgoGWwjD.mjs";
import { T as Text2, B as Button, I as Icon, b as Input, F as FormField, L as Label, C as Card, c as CardHeader, d as CardTitle, e as CardDescription, f as CardContent, g as CardFooter, h as Checkbox, i as RichTextEditor } from "./router-DWBQ1rk2.mjs";
import { C as CopyButton } from "./index-D_C_pvI9.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { e as Moon, S as Sun, P as Palette, f as Sparkles, C as Check } from "../_libs/lucide-react.mjs";
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
function ShowcaseSection({
  title,
  description,
  theme,
  children
}) {
  const surfaceClass = theme === "dark" ? "bg-black" : "bg-white";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: `relative overflow-hidden border-border/70 shadow-xl ${surfaceClass}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { className: "relative", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H4, { className: "text-balance", children: title }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: description }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { className: "relative", children })
  ] });
}
function DesignSystemShowcase({
  theme
}) {
  const surfaceClass = theme === "dark" ? "bg-black" : "bg-white";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border/70 p-4 shadow-2xl sm:p-5 ${surfaceClass}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `relative flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3 ${surfaceClass}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: Palette, color: "accentForeground" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { weight: "semibold", children: theme === "light" ? "Light Theme" : "Dark Theme" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex items-center gap-2 rounded-lg border border-border/60 p-2 ${surfaceClass}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(LatitudeLogo, { className: "h-5 w-5" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: "@repo/ui" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ShowcaseSection, { theme, title: "Typography", description: "Text scales and mono primitives.", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H1, { children: "Heading 1" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H2, { children: "Heading 2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H3, { children: "Heading 3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H4, { children: "Heading 4" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: "Heading 5" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Heading 6" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.Mono, { children: 'const status = "ready";' })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ShowcaseSection, { theme, title: "Buttons", description: "Variants, states, and visual hierarchy.", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-2 sm:grid-cols-2 lg:grid-cols-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { children: "Default" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "secondary", children: "Secondary" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", flat: true, children: "Outline Flat" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", children: "Ghost" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "destructive", children: "Destructive" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { isLoading: true, children: "Loading…" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ShowcaseSection, { theme, title: "Forms", description: "Input, label, and form field composition.", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { label: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Email" }), name: "email", type: "email", autoComplete: "off", spellCheck: false, placeholder: "hello@latitude.so…" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(FormField, { label: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Workspace Name" }), description: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: "Used across your tenant settings." }), errors: ["Use at least 3 characters."], children: /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { name: "workspaceName", autoComplete: "off", placeholder: "Acme Inc.…", "aria-invalid": "true" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: `manual-input-${theme}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Manual Label + Input" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: `manual-input-${theme}`, name: `manual-input-${theme}`, autoComplete: "off", placeholder: "Custom field…" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ShowcaseSection, { theme, title: "Checkbox", description: "Selection control with indeterminate state.", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CheckboxShowcase, {}) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ShowcaseSection, { theme, title: "Rich Text Editor", description: "Lazy-loaded CodeMirror editor with JSON detection.", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RichTextEditorShowcase, {}) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ShowcaseSection, { theme, title: "Copy Button", description: "Clipboard copy with feedback.", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.Mono, { children: "Hello, world!" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { value: "Hello, world!" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.Mono, { children: "cuid_abc123def456" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { value: "cuid_abc123def456" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: `relative overflow-hidden border-border/70 shadow-xl ${surfaceClass}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { className: "relative", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H4, { className: "text-balance", children: "Icons" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: "Lucide wrapper and brand icons." }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { className: "relative", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: Sparkles, size: "sm", color: "primary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: Check, size: "default", color: "success" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: Palette, size: "md", color: "accentForeground" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(GoogleIcon, { className: "h-5 w-5" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(GitHubIcon, { className: "h-5 w-5" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(LatitudeLogo, { className: "h-6 w-6" })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardFooter, { className: "relative", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: "`Select`, `Skeleton`, and `Tooltip` are exported in `@repo/ui` and are currently pending implementation." }) })
    ] })
  ] });
}
function CheckboxShowcase() {
  const [checked, setChecked] = reactExports.useState(false);
  const [showHitArea, setShowHitArea] = reactExports.useState(false);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Checkbox, { checked: false }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Unchecked" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Checkbox, { checked: true }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Checked" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Checkbox, { checked: "indeterminate" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Indeterminate" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Checkbox, { disabled: true }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: "Disabled" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Checkbox, { checked, onCheckedChange: setChecked, className: "hit-area-3", debugHitArea: showHitArea }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Text2.H6, { children: [
        "Interactive (hit-area-3) — state: ",
        String(checked)
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Checkbox, { checked: showHitArea, onCheckedChange: (v) => setShowHitArea(v === true) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { children: "Show hit area debug overlay" })
    ] })
  ] });
}
function RichTextEditorShowcase() {
  const [jsonValue, setJsonValue] = reactExports.useState('{\n  "name": "Latitude",\n  "type": "platform"\n}');
  const [textValue, setTextValue] = reactExports.useState("Hello, world!\nThis is plain text content.");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { weight: "bold", children: "JSON content (auto-detected)" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(RichTextEditor, { value: jsonValue, onChange: setJsonValue, minHeight: "100px" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { weight: "bold", children: "Plain text" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(RichTextEditor, { value: textValue, onChange: setTextValue, minHeight: "80px" })
    ] })
  ] });
}
function DesignSystemPage() {
  const [theme, setTheme] = reactExports.useState("light");
  const pageSurfaceClass = theme === "dark" ? "bg-black" : "bg-white";
  reactExports.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    return () => {
      const hostTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.toggle("dark", hostTheme === "dark");
      root.style.colorScheme = hostTheme;
    };
  }, [theme]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: "#design-system-main", className: "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50", children: "Skip to main content" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("main", { id: "design-system-main", className: `flex min-h-screen flex-col gap-6 overflow-x-hidden p-4 text-foreground sm:p-6 lg:p-8 ${pageSurfaceClass}`, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex w-full max-w-7xl self-center flex-col gap-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: `flex flex-col gap-4 rounded-2xl border border-border/70 p-5 shadow-xl sm:p-6 ${pageSurfaceClass}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/", className: "inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "←" }),
          "Back to Home"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "accentForeground", weight: "semibold", children: "UI Inventory" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H2, { className: "text-balance", children: "Design System" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: "Review every implemented `@repo/ui` component in one place. Toggle theme to validate visual parity." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap items-center gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", flat: true, onClick: () => {
            setTheme((currentTheme) => currentTheme === "light" ? "dark" : "light");
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: theme === "light" ? Moon : Sun, size: "sm" }),
            theme === "light" ? "Switch to Dark" : "Switch to Light"
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex items-center gap-2 rounded-lg border border-border/60 p-2 ${pageSurfaceClass}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H6, { color: "foregroundMuted", children: "Theme" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.Mono, { children: theme })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(DesignSystemShowcase, { theme })
    ] }) })
  ] });
}
export {
  DesignSystemPage as component
};
