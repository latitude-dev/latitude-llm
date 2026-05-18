import { Button, Input, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useForm } from "@tanstack/react-form"
import { createFileRoute } from "@tanstack/react-router"
import { updateProjectMutation, useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
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
    </SettingsPage>
  )
}
