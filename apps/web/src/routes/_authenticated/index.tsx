import {
  Button,
  CloseTrigger,
  Container,
  DropdownMenu,
  FormWrapper,
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
import { extractLeadingEmoji } from "@repo/utils"
import { useForm } from "@tanstack/react-form"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import {
  createProjectMutation,
  deleteProjectMutation,
  renameProjectMutation,
  useProjectsCollection,
} from "../../domains/projects/projects.collection.ts"
import type { ProjectRecord } from "../../domains/projects/projects.functions.ts"

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
})

function ProjectTitle({ name, projectId }: { name: string; projectId: string }) {
  const [emoji, title] = extractLeadingEmoji(name)

  return (
    <div className="flex items-center gap-2">
      {emoji && (
        <div className="min-w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
          <Text.H3>{emoji}</Text.H3>
        </div>
      )}
      <Link to="/projects/$projectId" params={{ projectId }}>
        <Text.H5 weight="medium">{title}</Text.H5>
      </Link>
    </div>
  )
}

function ProjectsTable({ projects }: { projects: ProjectRecord[] }) {
  const [projectToRename, setProjectToRename] = useState<ProjectRecord | null>(null)
  const router = useRouter()

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow verticalPadding>
            <TableHead>Name</TableHead>
            <TableHead className="w-44">Issues</TableHead>
            <TableHead className="w-44">Datasets</TableHead>
            <TableHead className="w-44">Traces (7D)</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow
              key={project.id}
              verticalPadding
              className="cursor-pointer"
              onClick={() => void router.navigate({ to: "/projects/$projectId", params: { projectId: project.id } })}
            >
              <TableCell>
                <ProjectTitle name={project.name} projectId={project.id} />
              </TableCell>
              <TableCell className="w-44">
                <Text.H5 color="foregroundMuted">—</Text.H5>
              </TableCell>
              <TableCell className="w-44">
                <Text.H5 color="foregroundMuted">—</Text.H5>
              </TableCell>
              <TableCell className="w-44">
                <Text.H5 color="foregroundMuted">—</Text.H5>
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
                        void deleteProjectMutation(project.id).isPersisted.promise
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
          ))}
        </TableBody>
      </Table>

      {projectToRename && <RenameProjectModal project={projectToRename} onClose={() => setProjectToRename(null)} />}
    </>
  )
}

function RenameProjectModal({ project, onClose }: { project: ProjectRecord; onClose: () => void }) {
  const { toast } = useToast()

  const form = useForm({
    defaultValues: {
      name: project.name,
    },
    onSubmit: async ({ value }) => {
      const transaction = renameProjectMutation(project.id, value.name)
      await transaction.isPersisted.promise
      toast({
        title: "Success",
        description: `Project renamed to "${value.name}".`,
      })
      onClose()
    },
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
  const form = useForm({
    defaultValues: {
      name: "",
    },
    onSubmit: async ({ value }) => {
      const transaction = createProjectMutation(value.name)
      await transaction.isPersisted.promise
      onClose()
    },
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
  const { organizationName } = Route.useRouteContext()
  const { data, isLoading } = useProjectsCollection()
  const projects = data ?? []

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
              {organizationName}
            </Text.H4>
          </span>
        }
        actions={
          <TableWithHeader.Button flat onClick={() => setCreateOpen(true)}>
            New project
          </TableWithHeader.Button>
        }
        table={
          isLoading ? (
            <TableSkeleton cols={5} rows={3} />
          ) : projects.length > 0 ? (
            <ProjectsTable projects={projects} />
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
