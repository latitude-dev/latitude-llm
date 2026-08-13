import { show as showIntercom } from "@intercom/messenger-js-sdk"
import {
  Avatar,
  Button,
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  DropdownMenu,
  Icon,
  Text,
} from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { FileText, HatGlassesIcon, LifeBuoy, Moon, Plus, ShieldAlertIcon, Sun } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { useOrganizationsCollection } from "../../../domains/organizations/organizations.collection.ts"
import { SidebarCollapseToggleButton, useSidebarCollapse } from "../../../layouts/AppSidebar/sidebar-collapse.tsx"
import { authClient } from "../../../lib/auth-client.ts"
import { resetPostHog } from "../../../lib/posthog/posthog-client.ts"
import { useThemePreference } from "../../../lib/theme.ts"
import { isAdminUser } from "../../../server/admin-auth.ts"
import { useRootThemePreference } from "../../-root-route-data.ts"
import { BreadcrumbTrail } from "./breadcrumb-trail.tsx"
import {
  BreadcrumbSwitcherChevron,
  breadcrumbSwitcherEmojiClassName,
  breadcrumbSwitcherTriggerClassName,
} from "./breadcrumb-ui.tsx"
import { CreateOrganizationModal } from "./create-organization-modal.tsx"
import { NotificationBell } from "./notifications/notification-bell.tsx"

const route = getRouteApi("/_authenticated")

const CREATE_ORG_KEY = "@create-organization"

interface OrgOption {
  readonly key: string
  readonly id: string
  readonly label: string
  readonly emoji: string | null
  readonly isActive: boolean
}

const CREATE_ORG_OPTION: OrgOption = {
  key: CREATE_ORG_KEY,
  id: CREATE_ORG_KEY,
  label: "Create new",
  emoji: null,
  isActive: false,
}

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
  const { data: allOrgs } = useOrganizationsCollection()
  const org = allOrgs?.find((o) => o.id === organizationId)
  const router = useRouter()
  const isAdmin = isAdminUser(user)
  const initialTheme = useRootThemePreference()
  const { theme, setTheme } = useThemePreference(initialTheme)
  const nextTheme = theme === "dark" ? "light" : "dark"
  const [createOrgModalOpen, setCreateOrgModalOpen] = useState(false)
  const { collapsed } = useSidebarCollapse()
  const orgTriggerRef = useRef<HTMLButtonElement>(null)

  const orgItems = useMemo<OrgOption[]>(() => {
    const options = (allOrgs ?? [])
      .map((o): OrgOption => {
        const [emoji, rest] = extractLeadingEmoji(o.name)
        return { key: o.id, id: o.id, label: rest || o.name, emoji: emoji || null, isActive: o.id === organizationId }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
    return [...options, CREATE_ORG_OPTION]
  }, [allOrgs, organizationId])

  const selectedOrgOption = useMemo(() => orgItems.find((item) => item.isActive) ?? null, [orgItems])

  if (!org) return null

  const handleOrgSwitch = async (newOrgId: string) => {
    if (newOrgId === organizationId) return
    await authClient.organization.setActive({
      organizationId: newOrgId,
    })
    window.location.href = "/"
  }

  const [activeOrgEmoji, activeOrgName] = extractLeadingEmoji(org.name)

  return (
    <header className="w-full bg-background border-b border-border h-12 flex items-center gap-4 px-4 shrink-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {collapsed && <SidebarCollapseToggleButton className="h-8 w-8 shrink-0 -ml-1" />}
        <Combobox
          autoHighlight
          modal
          // No ComboboxInput here, so base-ui's internal query state goes stale after a selection and
          // silently filters out other orgs on reopen; filter={null} disables that filtering entirely.
          filter={null}
          value={selectedOrgOption}
          onValueChange={(picked: OrgOption | null) => {
            if (!picked) return
            if (picked.key === CREATE_ORG_KEY) {
              setCreateOrgModalOpen(true)
              return
            }
            if (picked.isActive) return
            void handleOrgSwitch(picked.id)
          }}
          items={orgItems}
          itemToStringValue={(item: OrgOption) => item.label.toLowerCase()}
          isItemEqualToValue={(a: OrgOption, b: OrgOption) => a.key === b.key}
        >
          <ComboboxTrigger
            ref={orgTriggerRef}
            className={breadcrumbSwitcherTriggerClassName}
            icon={<BreadcrumbSwitcherChevron />}
          >
            {activeOrgEmoji ? <span className={breadcrumbSwitcherEmojiClassName}>{activeOrgEmoji}</span> : null}
            <Text.H5M color="foreground" ellipsis>
              {activeOrgName || org.name}
            </Text.H5M>
          </ComboboxTrigger>
          <ComboboxContent anchor={orgTriggerRef} className="w-64 min-w-64">
            <ComboboxList>
              {(item: OrgOption) =>
                item.key === CREATE_ORG_KEY ? (
                  <>
                    <ComboboxSeparator />
                    <ComboboxItem value={item}>
                      <Icon icon={Plus} size="sm" color="foregroundMuted" />
                      <Text.H5 className="flex-1 truncate">{item.label}</Text.H5>
                    </ComboboxItem>
                  </>
                ) : (
                  <ComboboxItem value={item}>
                    {item.emoji ? <span className="text-sm">{item.emoji}</span> : null}
                    <Text.H5 className="flex-1 truncate">{item.label}</Text.H5>
                  </ComboboxItem>
                )
              }
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <CreateOrganizationModal open={createOrgModalOpen} onOpenChange={setCreateOrgModalOpen} />
        <BreadcrumbTrail />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <NotificationBell />
        {supportEnabled && (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => showIntercom()} aria-label="Help">
            <Icon icon={LifeBuoy} size="sm" />
            <span className="hidden md:block">Help</span>
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-8" asChild>
          <a href="https://docs.latitude.so" target="_blank" rel="noopener noreferrer">
            <Icon icon={FileText} size="sm" />
            <span className="hidden md:block">Docs</span>
          </a>
        </Button>
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
