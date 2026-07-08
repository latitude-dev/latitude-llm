import { isShowcaseProjectSlug } from "@domain/shared"
import { Container, cn } from "@repo/ui"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { useHasMatchStaticData } from "../../../../lib/hooks/use-router-selectors.ts"
import { BreadcrumbText } from "../../-components/breadcrumb-ui.tsx"
import { SettingsSubNav } from "./settings/-components/settings-sub-nav.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings")({
  beforeLoad: ({ params }) => {
    if (isShowcaseProjectSlug(params.projectSlug)) {
      throw redirect({
        to: "/projects/$projectSlug",
        params: { projectSlug: params.projectSlug },
      })
    }
  },
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Settings</BreadcrumbText>,
    collapseSidebar: true,
  },
  component: SettingsLayout,
})

function SettingsLayout() {
  const { projectSlug } = Route.useParams()
  const fillHeight = useHasMatchStaticData((staticData) => staticData?.fillHeight === true)
  return (
    <div className="flex h-full min-w-0">
      <SettingsSubNav projectSlug={projectSlug} />
      <main className={cn("flex-1 min-w-0 flex flex-col", fillHeight ? "overflow-hidden" : "overflow-y-auto")}>
        <Container
          className={cn("@container flex flex-col gap-8 px-6 pt-6", {
            "flex-1 min-h-0 overflow-hidden": fillHeight,
          })}
        >
          <Outlet />
        </Container>
      </main>
    </div>
  )
}
