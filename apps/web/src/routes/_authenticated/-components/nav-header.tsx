import { show as showIntercom } from "@intercom/messenger-js-sdk"
import { Avatar, DropdownMenu, Icon, LatitudeLogo, Text } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { ChevronsUpDown, HatGlassesIcon, LifeBuoy, Moon, Plus, SearchIcon, ShieldAlertIcon, Sun } from "lucide-react"
import { useState } from "react"
import { useCommandPalette } from "../../../components/command-palette/command-palette-provider.tsx"
import { useOrganizationsCollection } from "../../../domains/organizations/organizations.collection.ts"
import { authClient } from "../../../lib/auth-client.ts"
import { resetPostHog } from "../../../lib/posthog/posthog-client.ts"
import { useThemePreference } from "../../../lib/theme.ts"
import { isAdminUser } from "../../../server/admin-auth.ts"
import { useRootThemePreference } from "../../-root-route-data.ts"
import { BillingCreditCounter } from "./billing-credit-counter.tsx"
import { BreadcrumbTrail } from "./breadcrumb-trail.tsx"
import { CreateOrganizationModal } from "./create-organization-modal.tsx"
import { NotificationBell } from "./notifications/notification-bell.tsx"

const route = getRouteApi("/_authenticated")

export function NavHeader() {
  const user = route.useLoaderData({ select: (data) => data.user })
  const organizationId = route.useLoaderData({
    select: (data) => data.organizationId,
  })
  const impersonatedBy = route.useLoaderData({
    select: (data) => data.impersonatedBy,
  })
  const supportEnabled = route.useLoaderData({
    select: (data) => data.supportIdentity !== null,
  })
  const organizationBilling = route.useLoaderData({
    select: (data) => data.organizationBilling,
  })
  const { data: allOrgs } = useOrganizationsCollection()
  const org = allOrgs?.find((o) => o.id === organizationId)
  const router = useRouter()
  const isAdmin = isAdminUser(user)
  const initialTheme = useRootThemePreference()
  const { theme, setTheme } = useThemePreference(initialTheme)
  const nextTheme = theme === "dark" ? "light" : "dark"
  const [createOrgModalOpen, setCreateOrgModalOpen] = useState(false)
  const commandPalette = useCommandPalette()

  if (!org) return null

  const handleOrgSwitch = async (newOrgId: string) => {
    if (newOrgId === organizationId) return
    await authClient.organization.setActive({
      organizationId: newOrgId,
    })
    window.location.href = "/"
  }

  const orgOptions = (allOrgs ?? []).map((o) => {
    const [emoji, rest] = extractLeadingEmoji(o.name)
    return {
      label: rest || o.name,
      leading: emoji ? <span className="text-base leading-none">{emoji}</span> : null,
      selected: o.id === organizationId,
      onClick: () => void handleOrgSwitch(o.id),
    }
  })

  const [activeOrgEmoji, activeOrgName] = extractLeadingEmoji(org.name)

  return (
    <header className="w-full bg-background border-b border-border h-12 flex items-center gap-4 px-4 shrink-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <LatitudeLogo className="h-5 w-5 shrink-0" />
        <span className="text-muted-foreground text-sm select-none shrink-0">/</span>
        <DropdownMenu
          side="bottom"
          align="start"
          options={[
            ...orgOptions,
            { type: "separator" },
            {
              label: "Create new organization",
              iconProps: { icon: Plus, size: "sm" as const },
              onClick: () => setCreateOrgModalOpen(true),
            },
          ]}
          trigger={() => (
            <button
              type="button"
              className="flex min-w-0 max-w-48 items-center gap-1.5 px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"
            >
              {activeOrgEmoji ? <span className="text-base leading-none shrink-0">{activeOrgEmoji}</span> : null}
              <span className="text-sm font-medium text-foreground truncate">{activeOrgName || org.name}</span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          )}
        />
        <CreateOrganizationModal open={createOrgModalOpen} onOpenChange={setCreateOrgModalOpen} />
        <BreadcrumbTrail />
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          onClick={() => commandPalette.setOpen(true)}
          aria-label="Search"
          className="flex items-center gap-2 rounded-md border border-border px-2 py-1 transition-colors hover:bg-muted"
        >
          <Icon icon={SearchIcon} size="sm" color="foregroundMuted" />
          <span className="hidden items-center gap-2 md:flex">
            <Text.H6 color="foregroundMuted">Search</Text.H6>
            <kbd className="rounded bg-muted px-1 font-mono text-xs text-muted-foreground">⌘K</kbd>
          </span>
        </button>
        <BillingCreditCounter organizationId={organizationId} initialOverview={organizationBilling} />
        <NotificationBell />
        {supportEnabled && (
          <button
            type="button"
            onClick={() => showIntercom()}
            aria-label="Help"
            className="flex items-center gap-1.5 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            <Icon icon={LifeBuoy} size="sm" />
            <span className="hidden md:block">
              <Text.H5>Help</Text.H5>
            </span>
          </button>
        )}
        <a
          href="https://docs.latitude.so"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden text-sm text-foreground hover:text-muted-foreground transition-colors md:block"
        >
          Docs
        </a>
        <DropdownMenu
          side="bottom"
          align="end"
          options={[
            {
              label: `Switch theme`,
              iconProps: {
                icon: theme === "dark" ? Sun : Moon,
                size: "sm" as const,
              },
              onClick: () => setTheme(nextTheme),
            },
            ...(isAdmin
              ? [
                  {
                    label: "Backoffice",
                    iconProps: { icon: ShieldAlertIcon, size: "sm" as const },
                    onClick: () => {
                      void router.navigate({ to: "/backoffice" })
                    },
                  },
                ]
              : []),
            {
              label: "Log out",
              type: "destructive",
              onClick: () => {
                void authClient.signOut().then(async () => {
                  // Reset PostHog AFTER sign-out so events captured during the
                  // logout flow stay attributed. The next user starts anonymous
                  // until PostHogIdentity remounts with a new key.
                  await resetPostHog()
                  void router.navigate({ to: "/login" })
                })
              },
            },
          ]}
          trigger={() => (
            <button type="button" className="flex items-center cursor-pointer">
              <span className="relative inline-flex">
                <Avatar
                  name={user.name?.trim() ? user.name : user.email}
                  size="sm"
                  imageSrc={user.image ?? undefined}
                />
                {impersonatedBy && (
                  // Small hat glasses icon overlaid on the user's avatar whenever the session is an impersonation.
                  <span
                    aria-hidden="true"
                    className="absolute -top-1/2 -right-1/2 transform -translate-x-1/2 translate-y-1 items-center justify-center"
                  >
                    <Icon icon={HatGlassesIcon} size="md" />
                  </span>
                )}
              </span>
            </button>
          )}
        />
      </div>
    </header>
  )
}
