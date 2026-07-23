import { createFileRoute } from "@tanstack/react-router"
import { TagsIcon } from "lucide-react"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../-route-data.ts"
import { BehavioursPage } from "./-components/behaviours-page.tsx"

function BehavioursBreadcrumb() {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TagsIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <BreadcrumbText variant="current">Behaviors</BreadcrumbText>
    </span>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/behaviours/")({
  staticData: {
    breadcrumb: BehavioursBreadcrumb,
  },
  component: BehavioursIndexPage,
})

function BehavioursIndexPage() {
  const project = useRouteProject()
  return <BehavioursPage project={project} />
}
