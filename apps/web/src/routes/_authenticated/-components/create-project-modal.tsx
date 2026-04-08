import { generateId } from "@domain/shared"
import { Button, CloseTrigger, FormWrapper, Input, Modal, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useRouter } from "@tanstack/react-router"
import { createProject } from "../../../domains/projects/projects.functions.ts"
import { getQueryClient } from "../../../lib/data/query-client.tsx"
import { toUserMessage } from "../../../lib/errors.ts"

export function CreateProjectModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast()
  const router = useRouter()
  const form = useForm({
    defaultValues: {
      name: "",
    },
    onSubmit: async ({ value }) => {
      try {
        const id = generateId<"ProjectId">()
        const project = await createProject({ data: { id, name: value.name.trim() } })
        getQueryClient().invalidateQueries({ queryKey: ["projects"] })
        onOpenChange(false)
        form.reset()
        void router.navigate({ to: "/projects/$projectSlug", params: { projectSlug: project.slug } })
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error creating project",
          description: toUserMessage(error),
        })
      }
    },
  })

  return (
    <Modal
      open={open}
      dismissible
      onOpenChange={onOpenChange}
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
