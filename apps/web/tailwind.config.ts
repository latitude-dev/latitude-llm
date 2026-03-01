import uiConfig from "@repo/ui/tailwind.config";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: uiConfig.theme,
  plugins: uiConfig.plugins,
};
