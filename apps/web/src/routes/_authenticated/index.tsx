import {
  Button,
  CloseTrigger,
  Container,
  DropdownMenu,
  FormWrapper,
  Icon,
  Input,
  Modal,
  Table,
  TableBlankSlate,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  TableWithHeader,
  Text,
  useToast,
} from "@repo/ui"
import { extractLeadingEmoji, formatCount } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { useForm } from "@tanstack/react-form"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { DatabaseIcon, PlusIcon, ShieldAlertIcon, TextAlignStartIcon } from "lucide-react"
import { useState } from "react"
import { useOrganizationsCollection } from "../../domains/organizations/organizations.collection.ts"
import {
  createProjectMutation,
  deleteProjectMutation,
  renameProjectMutation,
  useProjectsCollection,
  useProjectsStats,
} from "../../domains/projects/projects.collection.ts"
import type { ProjectRecord } from "../../domains/projects/projects.functions.ts"
import { toUserMessage } from "../../lib/errors.ts"
import { createFormSubmitHandler } from "../../lib/form-server-action.ts"
import { useAuthenticatedOrganizationId } from "./-route-data.ts"

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
})

function ProjectTitle({ name, projectSlug }: { name: string; projectSlug: string }) {
  const [emoji, title] = extractLeadingEmoji(name)

  return (
    <div className="flex items-center gap-2">
      {emoji && (
        <div className="min-w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
          <Text.H3>{emoji}</Text.H3>
        </div>
      )}
      <Link to="/projects/$projectSlug" params={{ projectSlug }}>
        <Text.H5 weight="medium">{title}</Text.H5>
      </Link>
    </div>
  )
}

function DeleteProjectModal({ project, onClose }: { project: ProjectRecord; onClose: () => void }) {
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteProjectMutation(project.id).isPersisted.promise
      toast({
        title: "Success",
        description: `Project "${project.name}" has been deleted.`,
      })
      onClose()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error deleting project",
        description: toUserMessage(error),
      })
      setDeleting(false)
    }
  }

  return (
    <Modal
      open
      dismissible
      onOpenChange={onClose}
      title="Delete Project"
      description={`Are you sure you want to delete "${project.name}"? This action cannot be undone.`}
      footer={
        <div className="flex flex-row items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            <Text.H5>Cancel</Text.H5>
          </Button>
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
            <Text.H5 color="white">{deleting ? "Deleting..." : "Delete Project"}</Text.H5>
          </Button>
        </div>
      }
    />
  )
}

function ProjectsTable({
  projects,
  statsByProjectId,
  isLoadingStats,
}: {
  projects: ProjectRecord[]
  statsByProjectId: Map<string, { activeIssueCount: number; datasetCount: number; traceCount: number }>
  isLoadingStats: boolean
}) {
  const [projectToRename, setProjectToRename] = useState<ProjectRecord | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<ProjectRecord | null>(null)
  const router = useRouter()

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow verticalPadding>
            <TableHead>Name</TableHead>
            <TableHead className="w-44">
              <div className="flex items-center gap-1.5">
                <Icon icon={ShieldAlertIcon} size="sm" color="foregroundMuted" />
                <span>Issues</span>
              </div>
            </TableHead>
            <TableHead className="w-44">
              <div className="flex items-center gap-1.5">
                <Icon icon={DatabaseIcon} size="sm" color="foregroundMuted" />
                <span>Datasets</span>
              </div>
            </TableHead>
            <TableHead className="w-44">
              <div className="flex items-center gap-1.5">
                <Icon icon={TextAlignStartIcon} size="sm" color="foregroundMuted" />
                <span>Traces</span>
              </div>
            </TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => {
            const stats = statsByProjectId.get(project.id)
            return (
              <TableRow
                key={project.id}
                verticalPadding
                className="cursor-pointer"
                onClick={() =>
                  void router.navigate({ to: "/projects/$projectSlug", params: { projectSlug: project.slug } })
                }
              >
                <TableCell>
                  <ProjectTitle name={project.name} projectSlug={project.slug} />
                </TableCell>
                <TableCell className="w-44">
                  {isLoadingStats ? (
                    <div className="h-4 w-8 bg-muted rounded animate-pulse" />
                  ) : (
                    <Text.H5 color="foregroundMuted">{stats?.activeIssueCount ?? 0}</Text.H5>
                  )}
                </TableCell>
                <TableCell className="w-44">
                  {isLoadingStats ? (
                    <div className="h-4 w-8 bg-muted rounded animate-pulse" />
                  ) : (
                    <Text.H5 color="foregroundMuted">{stats?.datasetCount ?? 0}</Text.H5>
                  )}
                </TableCell>
                <TableCell className="w-44">
                  {isLoadingStats ? (
                    <div className="h-4 w-8 bg-muted rounded animate-pulse" />
                  ) : (
                    <Text.H5 color="foregroundMuted">{formatCount(stats?.traceCount ?? 0)}</Text.H5>
                  )}
                </TableCell>
                <TableCell preventDefault>
                  <DropdownMenu
                    options={[
                      {
                        label: "Rename",
                        onClick: () => {
                          setProjectToRename(project)
                        },
                      },
                      {
                        label: "Delete",
                        type: "destructive",
                        onClick: () => {
                          setProjectToDelete(project)
                        },
                      },
                    ]}
                    side="bottom"
                    align="end"
                    triggerButtonProps={{
                      className: "border-none justify-end cursor-pointer",
                    }}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {projectToRename && <RenameProjectModal project={projectToRename} onClose={() => setProjectToRename(null)} />}
      {projectToDelete && <DeleteProjectModal project={projectToDelete} onClose={() => setProjectToDelete(null)} />}
    </>
  )
}

function RenameProjectModal({ project, onClose }: { project: ProjectRecord; onClose: () => void }) {
  const { toast } = useToast()

  const form = useForm({
    defaultValues: {
      name: project.name,
    },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const transaction = renameProjectMutation(project.id, value.name)
        await transaction.isPersisted.promise
        return value.name
      },
      {
        onSuccess: async (newName) => {
          toast({
            title: "Success",
            description: `Project renamed to "${newName}".`,
          })
          onClose()
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Error renaming project",
            description: toUserMessage(error),
          })
        },
      },
    ),
  })

  return (
    <Modal
      open
      dismissible
      onOpenChange={onClose}
      title="Rename Project"
      description="Change the name of this project."
      footer={
        <>
          <CloseTrigger />
          <Button
            type="submit"
            onClick={() => {
              void form.handleSubmit()
            }}
          >
            Rename Project
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FormWrapper>
          <form.Field name="name">
            {(field) => (
              <Input
                required
                type="text"
                label="Name"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="New project name"
              />
            )}
          </form.Field>
        </FormWrapper>
      </form>
    </Modal>
  )
}

function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const form = useForm({
    defaultValues: {
      name: "",
    },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const transaction = createProjectMutation(value.name)
        await transaction.isPersisted.promise
      },
      {
        onSuccess: async () => {
          onClose()
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Error creating project",
            description: toUserMessage(error),
          })
        },
      },
    ),
  })

  return (
    <Modal
      open={open}
      dismissible
      onOpenChange={onClose}
      title="Create Project"
      description="Create a new project to start adding your prompts."
      footer={
        <>
          <CloseTrigger />
          <Button
            type="submit"
            onClick={() => {
              void form.handleSubmit()
            }}
          >
            Create Project
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FormWrapper>
          <form.Field name="name">
            {(field) => (
              <Input
                required
                type="text"
                label="Name"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="My awesome project"
              />
            )}
          </form.Field>
        </FormWrapper>
      </form>
    </Modal>
  )
}

function DashboardPageContent() {
  const [createOpen, setCreateOpen] = useState(false)
  const organizationId = useAuthenticatedOrganizationId()
  const { data: org } = useOrganizationsCollection((orgs) =>
    orgs.where(({ organizations }) => eq(organizations.id, organizationId)).findOne(),
  )
  const { data, isLoading: isLoadingProjects } = useProjectsCollection()
  const projects = data ?? []
  const projectIds = projects.map((p) => p.id)
  const { statsByProjectId, isLoading: isLoadingStats } = useProjectsStats(projectIds)

  return (
    <>
      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <TableWithHeader
        title={
          <span>
            <Text.H4 color="foregroundMuted" display="inline">
              Projects in{" "}
            </Text.H4>
            <Text.H4 weight="bold" display="inline">
              {org?.name}
            </Text.H4>
          </span>
        }
        actions={
          <TableWithHeader.Button onClick={() => setCreateOpen(true)}>
            <Icon icon={PlusIcon} size="sm" />
            Project
          </TableWithHeader.Button>
        }
        table={
          isLoadingProjects ? (
            <TableSkeleton cols={5} rows={3} />
          ) : projects.length > 0 ? (
            <ProjectsTable projects={projects} statsByProjectId={statsByProjectId} isLoadingStats={isLoadingStats} />
          ) : (
            <TableBlankSlate
              description="There are no projects yet. Create one to start adding your prompts."
              link={
                <TableBlankSlate.Button onClick={() => setCreateOpen(true)}>
                  Create your first project
                </TableBlankSlate.Button>
              }
            />
          )
        }
      />
    </>
  )
}

function DashboardPage() {
  return (
    <Container className="pt-14">
      <DashboardPageContent />
    </Container>
  )
}
