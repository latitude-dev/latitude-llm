import { Button, Container, Text } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { ClientOnly, Link, createFileRoute } from "@tanstack/react-router"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectViewPage,
})

function ProjectViewContent() {
  const { projectId } = Route.useParams()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.id, projectId)).findOne(),
    [projectId],
  )

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Text.H4 color="foregroundMuted">Project not found</Text.H4>
        <Link to="/">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
    )
  }

  const [emoji, title] = extractLeadingEmoji(project.name)

  return (
    <>
      <div className="flex flex-col items-center gap-6 py-16">
        {emoji && (
          <div className="min-w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Text.H1>{emoji}</Text.H1>
          </div>
        )}
        <div className="flex flex-col items-center gap-2 max-w-md">
          <Text.H3 weight="medium">{title}</Text.H3>
          {project.description && <Text.H5 color="foregroundMuted">{project.description}</Text.H5>}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-lg bg-gradient-to-b from-secondary to-transparent">
        <Text.H5 color="foregroundMuted">Project view is under construction</Text.H5>
        <Link to="/">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
    </>
  )
}

function ProjectViewPage() {
  return (
    <Container>
      <ClientOnly>
        <ProjectViewContent />
      </ClientOnly>
    </Container>
  )
}
