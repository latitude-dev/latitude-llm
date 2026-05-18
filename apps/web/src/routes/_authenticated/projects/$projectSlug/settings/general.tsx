import { Button, FormWrapper, Input, Modal, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useForm } from "@tanstack/react-form"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import {
  deleteProjectMutation,
  updateProjectMutation,
  useProjectsCollection,
} from "../../../../../domains/projects/projects.collection.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../lib/form-server-action.ts"
import { useRouteProject } from "../-route-data.ts"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/general")({
  component: ProjectGeneralSettingsPage,
})

function ProjectGeneralSettingsPage() {
  const { toast } = useToast()
  const routeProject = useRouteProject()

  const { data: liveProject } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.id, routeProject.id)).findOne(),
    [routeProject.id],
  )
  const currentProject = liveProject ?? routeProject

  const form = useForm({
    defaultValues: { name: currentProject.name },
    onSubmit: createFormSubmitHandler(
      async ({ name }) => {
        const trimmed = name.trim()
        const transaction = updateProjectMutation(currentProject.id, { name: trimmed })
        await transaction.isPersisted.promise
      },
      {
        resetOnSuccess: false,
        onSuccess: () => {
          toast({ description: "Project name updated" })
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <SettingsPage title="Project settings" description="Set up your project info">
      <form
        className="flex w-full flex-col gap-3 @[800px]:w-1/2"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Input
              key={currentProject.id}
              type="text"
              name={field.name}
              label="Name"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
              placeholder="Project name"
              aria-label="Project name"
            />
          )}
        </form.Field>
        <div className="self-start">
          <Button type="submit" isLoading={form.state.isSubmitting}>
            Save
          </Button>
        </div>
      </form>
      <DeleteProjectSection projectId={currentProject.id} projectName={currentProject.name} />
    </SettingsPage>
  )
}

function DeleteProjectSection({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <Text.H4 weight="bold" color="destructive">
        Delete Project
      </Text.H4>
      <Text.H5 color="destructive">
        Permanently delete this project and all of its data. This action cannot be undone.
      </Text.H5>
      <div>
        <DeleteProjectConfirmModal open={open} setOpen={setOpen} projectId={projectId} projectName={projectName} />
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete Project
        </Button>
      </div>
    </div>
  )
}

function DeleteProjectConfirmModal({
  open,
  setOpen,
  projectId,
  projectName,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  projectId: string
  projectName: string
}) {
  const { toast } = useToast()
  const router = useRouter()
  const [confirmText, setConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  const expectedText = "delete my project"
  const isConfirmed = confirmText.toLowerCase() === expectedText

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteProjectMutation(projectId).isPersisted.promise
      toast({ description: `Project "${projectName}" has been deleted.` })
      // The parent `_authenticated` loader runs with `staleTime: Infinity`,
      // so a plain `navigate({ to: "/" })` reuses its cached projects list
      // and skips the "no projects → onboarding" branch. Invalidate first so
      // the loader re-runs against the post-delete state, then navigate; the
      // index loader (or the parent's onboarding redirect) takes it from
      // there.
      await router.invalidate()
      await router.navigate({ to: "/" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
      setIsDeleting(false)
    }
  }

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={(v) => {
        if (!v) setConfirmText("")
        setOpen(v)
      }}
      title="Delete Project"
      description={`This action is permanent and cannot be undone. The project "${projectName}" and all of its data will be deleted.`}
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!isConfirmed || isDeleting} onClick={() => void handleDelete()}>
            {isDeleting ? "Deleting..." : "Delete Project"}
          </Button>
        </>
      }
    >
      <FormWrapper>
        <Input
          type="text"
          label={`Type "${expectedText}" to confirm`}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={expectedText}
        />
      </FormWrapper>
    </Modal>
  )
}
