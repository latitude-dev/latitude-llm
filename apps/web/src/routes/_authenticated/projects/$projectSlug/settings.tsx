import { Container } from "@repo/ui"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import { BreadcrumbText } from "../../-components/breadcrumb-ui.tsx"
import { SettingsSubNav } from "./settings/-components/settings-sub-nav.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings")({
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Settings</BreadcrumbText>,
    collapseSidebar: true,
  },
  component: SettingsLayout,
})

function SettingsLayout() {
  const { projectSlug } = Route.useParams()
  return (
    <div className="flex h-full min-w-0">
      <SettingsSubNav projectSlug={projectSlug} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Container className="@container flex flex-col gap-8 px-6 pt-6">
          <Outlet />
        </Container>
      </main>
    </div>
  )
}
