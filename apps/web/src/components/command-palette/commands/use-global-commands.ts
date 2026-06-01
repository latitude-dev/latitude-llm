import { useRouter } from "@tanstack/react-router"
import { BookOpenIcon, Building2Icon, LogOutIcon, MoonIcon, PlusIcon, ShieldAlertIcon, SunIcon } from "lucide-react"
import { useMemo } from "react"
import { authClient } from "../../../lib/auth-client.ts"
import { resetPostHog } from "../../../lib/posthog/posthog-client.ts"
import { useThemePreference } from "../../../lib/theme.ts"
import { useAuthenticatedUser } from "../../../routes/_authenticated/-route-data.ts"
import { useRootThemePreference } from "../../../routes/-root-route-data.ts"
import { useCommandPalette } from "../command-palette-provider.tsx"
import type { PaletteCommand } from "../types.ts"

const DOCS_URL = "https://docs.latitude.so"

/**
 * Always-available global actions: theme toggle, create project/organization (open modals
 * owned by the provider), docs, log out, and backoffice (admins only). Mirrors the handlers
 * already wired into the app header so behaviour stays consistent.
 */
export function useGlobalCommands(): readonly PaletteCommand[] {
  const router = useRouter()
  const user = useAuthenticatedUser()
  const initialTheme = useRootThemePreference()
  const { theme, setTheme } = useThemePreference(initialTheme)
  const { openCreateProject, openCreateOrganization } = useCommandPalette()

  const nextTheme = theme === "dark" ? "light" : "dark"
  const isAdmin = (user as { role?: string }).role === "admin"

  return useMemo<readonly PaletteCommand[]>(() => {
    const commands: PaletteCommand[] = [
      {
        id: "action:new-project",
        title: "New project",
        icon: PlusIcon,
        section: "actions",
        keywords: "create project add",
        perform: openCreateProject,
      },
      {
        id: "action:new-organization",
        title: "New organization",
        icon: Building2Icon,
        section: "actions",
        keywords: "create organization workspace add",
        perform: openCreateOrganization,
      },
      {
        id: "action:switch-theme",
        title: `Switch to ${nextTheme} theme`,
        icon: nextTheme === "dark" ? MoonIcon : SunIcon,
        section: "actions",
        keywords: "theme dark light appearance toggle",
        perform: () => setTheme(nextTheme),
      },
      {
        id: "action:docs",
        title: "Open documentation",
        icon: BookOpenIcon,
        section: "actions",
        keywords: "docs help guide",
        perform: () => window.open(DOCS_URL, "_blank", "noopener,noreferrer"),
      },
      {
        id: "action:logout",
        title: "Log out",
        icon: LogOutIcon,
        section: "actions",
        keywords: "logout sign out exit",
        perform: () =>
          void authClient.signOut().then(async () => {
            await resetPostHog()
            void router.navigate({ to: "/login" })
          }),
      },
    ]

    if (isAdmin) {
      commands.push({
        id: "action:backoffice",
        title: "Backoffice",
        icon: ShieldAlertIcon,
        section: "actions",
        keywords: "backoffice admin staff",
        perform: () => void router.navigate({ to: "/backoffice" }),
      })
    }

    return commands
  }, [nextTheme, isAdmin, openCreateProject, openCreateOrganization, setTheme, router])
}
