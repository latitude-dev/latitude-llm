import { useToast } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { useRouter } from "@tanstack/react-router"
import {
  ArrowLeftRightIcon,
  BookOpenIcon,
  Building2Icon,
  LinkIcon,
  LogOutIcon,
  MoonIcon,
  PlusIcon,
  ShieldAlertIcon,
  SunIcon,
} from "lucide-react"
import { useMemo } from "react"
import { useOrganizationsCollection } from "../../../domains/organizations/organizations.collection.ts"
import { authClient } from "../../../lib/auth-client.ts"
import { resetPostHog } from "../../../lib/posthog/posthog-client.ts"
import { useThemePreference } from "../../../lib/theme.ts"
import { useAuthenticatedOrganizationId, useAuthenticatedUser } from "../../../routes/_authenticated/-route-data.ts"
import { useRootThemePreference } from "../../../routes/-root-route-data.ts"
import { useCommandPalette } from "../command-palette-provider.tsx"
import type { PaletteCommand } from "../types.ts"

const DOCS_URL = "https://docs.latitude.so"

/**
 * Always-available global actions: theme toggle, create project/organization (open modals
 * owned by the provider), switch organization (a drill-down sub-page), docs, log out, and
 * backoffice (admins only). Mirrors the handlers already wired into the app header.
 */
export function useGlobalCommands(): readonly PaletteCommand[] {
  const router = useRouter()
  const { toast } = useToast()
  const user = useAuthenticatedUser()
  const organizationId = useAuthenticatedOrganizationId()
  const { data: organizations } = useOrganizationsCollection()
  const initialTheme = useRootThemePreference()
  const { theme, setTheme } = useThemePreference(initialTheme)
  const { openCreateProject, openCreateOrganization } = useCommandPalette()

  const nextTheme = theme === "dark" ? "light" : "dark"
  const isAdmin = (user as { role?: string }).role === "admin"

  return useMemo<readonly PaletteCommand[]>(() => {
    const orgs = organizations ?? []
    const commands: PaletteCommand[] = []

    // Switch/navigate actions rank above create actions — switching is the more frequent intent.
    // Offer the drill-down switcher only when there is more than one org to switch between.
    if (orgs.length > 1) {
      commands.push({
        kind: "parent",
        id: "action:switch-organization",
        title: "Switch organization",
        icon: ArrowLeftRightIcon,
        section: "actions",
        keywords: "switch organization workspace change",
        getChildren: () =>
          orgs.map((org): PaletteCommand => {
            const [emoji, title] = extractLeadingEmoji(org.name)
            const isCurrent = org.id === organizationId
            return {
              id: `switch-org:${org.id}`,
              title: title || org.name,
              icon: Building2Icon,
              leading: emoji ? <span className="text-base leading-none">{emoji}</span> : undefined,
              section: "actions",
              ...(isCurrent ? { subtitle: "Current" } : {}),
              keywords: org.name,
              perform: () => {
                if (isCurrent) return
                void authClient.organization.setActive({ organizationId: org.id }).then(() => {
                  window.location.href = "/"
                })
              },
            }
          }),
      })
    }

    commands.push(
      {
        id: "action:switch-theme",
        title: `Switch to ${nextTheme} theme`,
        icon: nextTheme === "dark" ? MoonIcon : SunIcon,
        section: "actions",
        keywords: "theme dark light appearance toggle",
        perform: () => setTheme(nextTheme),
      },
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
        id: "action:copy-page-link",
        title: "Copy link to this page",
        icon: LinkIcon,
        section: "actions",
        keywords: "copy link url share current page",
        perform: () => {
          void navigator.clipboard.writeText(window.location.href)
          toast({ description: "Page link copied to clipboard." })
        },
      },
      {
        id: "action:docs",
        title: "Open documentation",
        icon: BookOpenIcon,
        section: "actions",
        keywords: "docs help guide",
        perform: () => {
          window.open(DOCS_URL, "_blank", "noopener,noreferrer")
        },
      },
    )

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

    // Log out sits last — it's the most destructive/terminal action.
    commands.push({
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
    })

    return commands
  }, [
    nextTheme,
    isAdmin,
    organizations,
    organizationId,
    openCreateProject,
    openCreateOrganization,
    setTheme,
    router,
    toast,
  ])
}
