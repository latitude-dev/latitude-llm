import { Container, TableBlankSlate, TableSkeleton, Text } from "@repo/ui"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { useLayoutEffect, useState } from "react"
import { useProjectsCollection } from "../../domains/projects/projects.collection.ts"
import { listProjects } from "../../domains/projects/projects.functions.ts"
import { pickProjectSlugForHome } from "../../lib/last-project-storage.ts"
import { CreateProjectModal } from "./-components/create-project-modal.tsx"

export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: async () => {
    const projects = await listProjects()
    if (projects.length === 1) {
      throw redirect({
        to: "/projects/$projectSlug",
        params: { projectSlug: projects[0].slug },
      })
    }
  },
  component: AuthenticatedHomePage,
})

function AuthenticatedHomePage() {
  const { organizationId } = Route.useRouteContext()
  const { data, isLoading } = useProjectsCollection()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const projects = data ?? []

  // TODO(frontend-use-effect-policy): imperative navigate after projects collection resolves for multi-project orgs
  useLayoutEffect(() => {
    if (isLoading) return
    if (projects.length < 2) return
    const slug = pickProjectSlugForHome(organizationId, projects)
    if (slug) {
      void router.navigate({ to: "/projects/$projectSlug", params: { projectSlug: slug }, replace: true })
    }
  }, [isLoading, projects, organizationId, router])

  if (isLoading || projects.length >= 2) {
    return (
      <Container className="pt-14">
        <TableSkeleton cols={3} rows={4} variant="listing" />
      </Container>
    )
  }

  if (projects.length === 0) {
    return (
      <Container className="flex flex-col gap-8 pt-14">
        <CreateProjectModal open={createOpen} onOpenChange={setCreateOpen} />
        <Text.H4 weight="bold">Projects</Text.H4>
        <TableBlankSlate
          description="There are no projects yet. Create one to start adding your prompts."
          link={
            <TableBlankSlate.Button onClick={() => setCreateOpen(true)}>
              Create your first project
            </TableBlankSlate.Button>
          }
        />
      </Container>
    )
  }

  return null
}
