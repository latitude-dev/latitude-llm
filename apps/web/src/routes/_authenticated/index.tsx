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
import { extractLeadingEmoji, relativeTime } from "@repo/utils"
import { useForm } from "@tanstack/react-form"
import { ClientOnly, Link, createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { useProjectsCollection } from "../../domains/projects/projects.collection.ts"
import { createProject, deleteProject, updateProject } from "../../domains/projects/projects.functions.ts"
import type { ProjectRecord } from "../../domains/projects/projects.functions.ts"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { AppTabs } from "../_authenticated.tsx"

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
})

function invalidateProjects() {
  void getQueryClient().invalidateQueries({ queryKey: ["projects"] })
}

function ProjectTitle({ name }: { name: string }) {
  const [emoji, title] = extractLeadingEmoji(name)

  return (
    <div className="flex items-center gap-2">
      {emoji && (
        <div className="min-w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
          <Text.H3>{emoji}</Text.H3>
        </div>
      )}
      <Text.H5>{title}</Text.H5>
    </div>
  )
}

function ProjectsTable({ projects }: { projects: ProjectRecord[] }) {
  const [projectToRename, setProjectToRename] = useState<ProjectRecord | null>(null)

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow verticalPadding>
            <TableHead>Name</TableHead>
            <TableHead>Created</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id} verticalPadding className="cursor-pointer">
              <TableCell>
                <Link to="/projects/$projectId" params={{ projectId: project.id }} className="contents">
                  <ProjectTitle name={project.name} />
                </Link>
              </TableCell>
              <TableCell>
                <Link to="/projects/$projectId" params={{ projectId: project.id }} className="contents">
                  <Text.H5 color="foregroundMuted">{relativeTime(project.createdAt)}</Text.H5>
                </Link>
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
                        void deleteProject({ data: { id: project.id } }).then(() => {
                          invalidateProjects()
                        })
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

function RenameProjectModal({
  project,
  onClose,
}: {
  project: ProjectRecord
  onClose: () => void
}) {
  const { toast } = useToast()

  const form = useForm({
    defaultValues: {
      name: project.name,
    },
    onSubmit: async ({ value }) => {
      await updateProject({ data: { id: project.id, name: value.name } })
      invalidateProjects()
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

function CreateProjectModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const form = useForm({
    defaultValues: {
      name: "",
    },
    onSubmit: async ({ value }) => {
      await createProject({ data: { name: value.name } })
      invalidateProjects()
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
  const projectsCollection = useProjectsCollection()
  const projects = projectsCollection.data ?? []
  const isLoading = !projectsCollection.data

  return (
    <>
      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <TableWithHeader
        title="Projects"
        actions={<TableWithHeader.Button onClick={() => setCreateOpen(true)}>Add project</TableWithHeader.Button>}
        table={
          isLoading ? (
            <TableSkeleton cols={3} rows={3} />
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
    <Container>
      <AppTabs />
      <ClientOnly fallback={<TableSkeleton cols={3} rows={3} />}>
        <DashboardPageContent />
      </ClientOnly>
    </Container>
  )
}
