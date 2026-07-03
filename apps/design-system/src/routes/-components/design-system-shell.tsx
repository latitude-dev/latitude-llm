import type { ReactNode } from "react"
import { DesignSystemSidebar } from "./design-system-sidebar.tsx"
import { DesignSystemThemeProvider } from "./design-system-theme.tsx"

export function DesignSystemShell({ children }: { children: ReactNode }) {
  return (
    <DesignSystemThemeProvider>
      <a
        href="#design-system-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to main content
      </a>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <DesignSystemSidebar />
        <main id="design-system-main" className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </DesignSystemThemeProvider>
  )
}
