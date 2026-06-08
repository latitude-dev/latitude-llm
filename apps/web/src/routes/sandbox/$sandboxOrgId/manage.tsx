import { Button, Icon, Input, Select, Text, useToast } from "@repo/ui"
import { createFileRoute, getRouteApi, Link, useRouter } from "@tanstack/react-router"
import { Boxes, Link2, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import {
  useAttachableParentProjects,
  useSandboxProjectMutations,
  useSandboxProjects,
} from "../../../domains/sandbox/sandbox-projects.collection.ts"
import { toUserMessage } from "../../../lib/errors.ts"

const sandboxRoute = getRouteApi("/sandbox/$sandboxOrgId")

/**
 * Sandbox project management: lists the sandbox's projects (each opens its
 * traces) and offers the two attach flows — add a *production* project (creates
 * a linked sandbox project) or create a *sandbox-only* project. Reached from the
 * sidebar; the sandbox index redirects straight to a project instead of here.
 */
export const Route = createFileRoute("/sandbox/$sandboxOrgId/manage")({
  component: SandboxManageProjectsPage,
})

function SandboxManageProjectsPage() {
  const { sandboxOrgId } = sandboxRoute.useParams()
  const router = useRouter()
  const { toast } = useToast()

  const { data: projects, isLoading } = useSandboxProjects(sandboxOrgId)
  const { data: attachable } = useAttachableParentProjects(sandboxOrgId)
  const { attachProduction, createSandboxOnly } = useSandboxProjectMutations(sandboxOrgId)

  const [selectedProductionId, setSelectedProductionId] = useState<string>("")
  const [newProjectName, setNewProjectName] = useState("")

  const attachableOptions = useMemo(
    () =>
      (attachable ?? []).map((p) => ({
        label: p.alreadyAttached ? `${p.name} (already added)` : p.name,
        value: p.id,
        disabled: p.alreadyAttached,
      })),
    [attachable],
  )

  const openProject = (slug: string) =>
    router.navigate({ to: "/sandbox/$sandboxOrgId/projects/$projectSlug", params: { sandboxOrgId, projectSlug: slug } })

  const handleAttach = async () => {
    if (!selectedProductionId) return
    try {
      const project = await attachProduction.mutateAsync(selectedProductionId)
      setSelectedProductionId("")
      await openProject(project.slug)
    } catch (error) {
      toast({ variant: "destructive", title: "Could not add project", description: toUserMessage(error) })
    }
  }

  const handleCreate = async () => {
    const name = newProjectName.trim()
    if (!name) return
    try {
      const project = await createSandboxOnly.mutateAsync(name)
      setNewProjectName("")
      await openProject(project.slug)
    } catch (error) {
      toast({ variant: "destructive", title: "Could not create project", description: toUserMessage(error) })
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-1">
        <Text.H3>Projects</Text.H3>
        <Text.H6 color="foregroundMuted">
          Add a production project to debug its dev traces, or spin up a sandbox-only project for prototyping.
        </Text.H6>
      </div>

      <div className="flex flex-col gap-2">
        {isLoading ? (
          <Text.H6 color="foregroundMuted">Loading projects…</Text.H6>
        ) : (projects ?? []).length === 0 ? (
          <Text.H6 color="foregroundMuted">No projects yet. Add one below to start sending traces.</Text.H6>
        ) : (
          (projects ?? []).map((project) => (
            <Link
              key={project.id}
              to="/sandbox/$sandboxOrgId/projects/$projectSlug"
              params={{ sandboxOrgId, projectSlug: project.slug }}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-muted"
            >
              <div className="flex items-center gap-2">
                <Icon icon={project.linkedProjectId ? Link2 : Boxes} size="sm" color="foregroundMuted" />
                <Text.H5M>{project.name}</Text.H5M>
                <Text.H6 color="foregroundMuted">/{project.slug}</Text.H6>
              </div>
              {project.linkedProjectId ? <Text.H6 color="foregroundMuted">Linked to production</Text.H6> : null}
            </Link>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <Text.H5M>Add a production project</Text.H5M>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              name="production-project"
              placeholder="Select a production project"
              options={attachableOptions}
              value={selectedProductionId}
              onChange={(value) => setSelectedProductionId(String(value))}
            />
          </div>
          <Button
            type="button"
            disabled={!selectedProductionId || attachProduction.isPending}
            onClick={() => void handleAttach()}
          >
            <Icon icon={Link2} size="sm" />
            Add
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <Text.H5M>Create a sandbox-only project</Text.H5M>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              type="text"
              label="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="My prototype"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!newProjectName.trim() || createSandboxOnly.isPending}
            onClick={() => void handleCreate()}
          >
            <Icon icon={Plus} size="sm" />
            Create
          </Button>
        </div>
      </div>
    </div>
  )
}
