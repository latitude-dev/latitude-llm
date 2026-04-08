import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  LatitudeLogo,
  Text,
} from "@repo/ui"
import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router"
import { BookOpen, ChevronsUpDown, Moon, Plus, Settings as SettingsIcon, Sun } from "lucide-react"
import { useState } from "react"
import { useOrganizationsCollection } from "../domains/organizations/organizations.collection.ts"
import { getSession } from "../domains/sessions/session.functions.ts"
import { authClient } from "../lib/auth-client.ts"
import { BreadcrumbTrail } from "./_authenticated/-components/breadcrumb-trail.tsx"
import { CreateOrganizationModal } from "./_authenticated/-components/create-organization-modal.tsx"

export const Route = createFileRoute("/_authenticated")({
  ssr: "data-only",
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login" })
    }

    const sessionData = session.session as Record<string, unknown>
    const organizationId =
      typeof sessionData.activeOrganizationId === "string" ? sessionData.activeOrganizationId : null
    if (!organizationId) {
      throw redirect({ to: "/welcome" })
    }

    return {
      user: session.user,
      organizationId,
    }
  },
  component: AuthenticatedLayout,
})

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false,
  )

  const toggle = () => {
    const next = !isDark
    document.documentElement.classList.toggle("dark", next)
    document.documentElement.style.colorScheme = next ? "dark" : "light"
    setIsDark(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}

function NavHeader() {
  const { user, organizationId } = Route.useRouteContext()
  const { data: allOrgs } = useOrganizationsCollection()
  const org = allOrgs?.find((o) => o.id === organizationId)
  const router = useRouter()
  const [createOrgOpen, setCreateOrgOpen] = useState(false)

  if (!org) return null

  const handleOrgSwitch = async (newOrgId: string) => {
    if (newOrgId === organizationId) return
    await authClient.organization.setActive({
      organizationId: newOrgId,
    })
    window.location.href = "/"
  }

  return (
    <>
      <CreateOrganizationModal open={createOrgOpen} onOpenChange={setCreateOrgOpen} />
      <header className="w-full bg-background border-b border-border h-12 flex items-center px-4 shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <Link to="/">
            <LatitudeLogo className="h-5 w-5" />
          </Link>
          <span className="text-muted-foreground text-sm select-none">/</span>
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 max-w-[min(260px,42vw)] cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-muted"
              >
                <Text.H5M className="min-w-0 truncate">{org.name}</Text.H5M>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" className="flex w-52 flex-col gap-1">
              {(allOrgs ?? []).map((o) => (
                <DropdownMenuItem
                  key={o.id}
                  className={o.id === organizationId ? "bg-muted" : undefined}
                  onSelect={() => {
                    void handleOrgSwitch(o.id)
                  }}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Text.H5 className="truncate">{o.name}</Text.H5>
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="my-0" />
              <DropdownMenuItem className="gap-2" onSelect={() => setCreateOrgOpen(true)}>
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Text.H5>New organization</Text.H5>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuRoot>
          <BreadcrumbTrail />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <a
                href="https://docs.latitude.so"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
              >
                <Icon icon={BookOpen} size="2xs" color="foregroundMuted" />
                Docs
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings" className="inline-flex items-center gap-1.5">
                <Icon icon={SettingsIcon} size="2xs" color="foregroundMuted" />
                Settings
              </Link>
            </Button>
          </div>
          <DropdownMenu
            side="bottom"
            align="end"
            options={[
              {
                label: "Log out",
                type: "destructive",
                onClick: () => {
                  void authClient.signOut().then(() => {
                    void router.navigate({ to: "/login" })
                  })
                },
              },
            ]}
            trigger={() => (
              <DropdownMenuTrigger asChild>
                <button type="button" className="cursor-pointer">
                  <Avatar
                    name={user.name?.trim() ? user.name : user.email}
                    size="sm"
                    imageSrc={user.image ?? undefined}
                  />
                </button>
              </DropdownMenuTrigger>
            )}
          />
        </div>
      </header>
    </>
  )
}

function AuthenticatedLayout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <NavHeader />
      <main className="w-full flex-grow min-h-0 h-full relative overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
