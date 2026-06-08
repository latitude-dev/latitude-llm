import { Button, CloseTrigger, FormWrapper, Input, Modal, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { listProjects } from "../../../domains/projects/projects.functions.ts"
import { SANDBOXES_QUERY_KEY } from "../../../domains/sandbox/sandbox.collection.ts"
import { createSandbox, deleteSandbox } from "../../../domains/sandbox/sandbox-lifecycle.functions.ts"
import {
  addProductionProjectToSandbox,
  createSandboxOnlyProject,
} from "../../../domains/sandbox/sandbox-projects.functions.ts"
import { parseServerError, toUserMessage } from "../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../lib/form-server-action.ts"
import {
  SandboxProjectChooser,
  type SandboxProjectMode,
} from "../../sandbox/$sandboxOrgId/-components/sandbox-project-chooser.tsx"

interface CreateSandboxModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

/**
 * First-run sandbox creation. The user names the sandbox and picks its first
 * project — either attaching a production project (creates a *linked* sandbox
 * project) or naming a new sandbox-only one. On success we route straight into
 * the sandbox so it feels like "switching into test mode".
 *
 * Uses `useForm` so the per-plan active-sandbox cap is surfaced **inline on the
 * Sandbox name field** (rethrown in field-error shape) rather than as a toast.
 */
export function CreateSandboxModal({ open, onOpenChange }: CreateSandboxModalProps) {
  const { toast } = useToast()
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects", "for-sandbox-create"],
    queryFn: () => listProjects(),
    staleTime: 30_000,
    enabled: open,
  })

  const [mode, setMode] = useState<SandboxProjectMode>("existing")
  const [productionProjectId, setProductionProjectId] = useState("")
  const [newProjectName, setNewProjectName] = useState("")

  const productionProjects = useMemo(() => (projects ?? []).map((p) => ({ id: p.id, name: p.name })), [projects])
  const projectChosen = mode === "existing" ? productionProjectId.length > 0 : newProjectName.trim().length > 0

  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: createFormSubmitHandler(
      async ({ name }) => {
        const trimmedSandboxName = name.trim()
        const selectedProject = projects?.find((p) => p.id === productionProjectId)
        const projectName = mode === "existing" ? (selectedProject?.name ?? "") : newProjectName.trim()

        let sandboxOrgId: string
        try {
          const { organization } = await createSandbox({ data: { name: trimmedSandboxName } })
          sandboxOrgId = organization.id
        } catch (error) {
          const parsed = parseServerError(error)
          if (parsed._tag === "SandboxActiveCapReachedError") {
            // Surface the per-plan cap inline on the Sandbox name field.
            throw new Error(JSON.stringify([{ path: ["name"], message: parsed.message }]))
          }
          throw error
        }

        // The sandbox org now exists. If creating its first project fails, the
        // sandbox would be orphaned — and since it counts against the per-plan
        // active cap, the next attempt would wrongly hit
        // `SandboxActiveCapReachedError`. Roll the sandbox back before rethrowing.
        let project: { slug: string }
        try {
          project =
            mode === "existing"
              ? await addProductionProjectToSandbox({ data: { sandboxOrgId, productionProjectId } })
              : await createSandboxOnlyProject({ data: { sandboxOrgId, name: projectName } })
        } catch (error) {
          await deleteSandbox({ data: { sandboxOrganizationId: sandboxOrgId } }).catch(() => {
            // Best-effort cleanup; surface the original project-creation error.
          })
          throw error
        }

        return { sandboxOrgId, projectSlug: project.slug }
      },
      {
        onSuccess: async ({ sandboxOrgId, projectSlug }) => {
          await queryClient.invalidateQueries({ queryKey: SANDBOXES_QUERY_KEY })
          onOpenChange(false)
          setProductionProjectId("")
          setNewProjectName("")
          await router.navigate({
            to: "/sandbox/$sandboxOrgId/projects/$projectSlug",
            params: { sandboxOrgId, projectSlug },
          })
        },
        onError: (error) => {
          toast({ variant: "destructive", title: "Could not create sandbox", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <Modal
      open={open}
      dismissible
      onOpenChange={onOpenChange}
      title="Create a sandbox"
      description="A sandbox is an isolated space for your development traces — separate from your live data, billing, and alerts."
      footer={
        <>
          <CloseTrigger />
          <Button
            form="create-sandbox-form"
            type="submit"
            disabled={form.state.isSubmitting || !form.state.values.name.trim() || !projectChosen}
          >
            {form.state.isSubmitting ? "Creating…" : "Create sandbox"}
          </Button>
        </>
      }
    >
      <form
        id="create-sandbox-form"
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
                label="Sandbox name"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
                placeholder="My dev sandbox"
              />
            )}
          </form.Field>
          <SandboxProjectChooser
            mode={mode}
            onModeChange={setMode}
            productionProjects={productionProjects}
            productionProjectId={productionProjectId}
            onProductionProjectChange={setProductionProjectId}
            newName={newProjectName}
            onNewNameChange={setNewProjectName}
            loading={isLoading}
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
