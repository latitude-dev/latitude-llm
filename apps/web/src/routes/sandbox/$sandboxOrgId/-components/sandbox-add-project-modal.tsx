import { Button, CloseTrigger, FormWrapper, Modal, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import {
  useAttachableParentProjects,
  useSandboxProjectMutations,
} from "../../../../domains/sandbox/sandbox-projects.collection.ts"
import { toUserMessage } from "../../../../lib/errors.ts"
import { SandboxProjectChooser, type SandboxProjectMode } from "./sandbox-project-chooser.tsx"

/**
 * Adds a project to the *current* sandbox — the "New project" action behind the
 * header's project switcher. Either attach a production project (creates a
 * linked sandbox project) or create a sandbox-only one. Navigates into the new
 * project's traces on success.
 */
export function SandboxAddProjectModal({
  sandboxOrgId,
  open,
  onOpenChange,
}: {
  readonly sandboxOrgId: string
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { toast } = useToast()
  const { data: attachable, isLoading } = useAttachableParentProjects(sandboxOrgId, open)
  const { attachProduction, createSandboxOnly } = useSandboxProjectMutations(sandboxOrgId)

  const [mode, setMode] = useState<SandboxProjectMode>("existing")
  const [productionProjectId, setProductionProjectId] = useState("")
  const [newProjectName, setNewProjectName] = useState("")

  const productionProjects = useMemo(
    () =>
      (attachable ?? []).map((p) => ({
        id: p.id,
        name: p.alreadyAttached ? `${p.name} (already added)` : p.name,
        disabled: p.alreadyAttached,
      })),
    [attachable],
  )

  // Once loaded, if every production project is already attached there's
  // nothing left to link — collapse to the sandbox-only name field. Keep the
  // toggle visible while loading so it doesn't flicker in.
  const allowProduction = isLoading || (attachable ?? []).some((p) => !p.alreadyAttached)
  const effectiveMode: SandboxProjectMode = allowProduction ? mode : "new"

  const submitting = attachProduction.isPending || createSandboxOnly.isPending
  const canSubmit = effectiveMode === "existing" ? productionProjectId.length > 0 : newProjectName.trim().length > 0

  const handleSubmit = async () => {
    try {
      const project =
        effectiveMode === "existing"
          ? await attachProduction.mutateAsync(productionProjectId)
          : await createSandboxOnly.mutateAsync(newProjectName.trim())
      onOpenChange(false)
      setProductionProjectId("")
      setNewProjectName("")
      await router.navigate({
        to: "/sandbox/$sandboxOrgId/projects/$projectSlug",
        params: { sandboxOrgId, projectSlug: project.slug },
      })
    } catch (error) {
      toast({ variant: "destructive", title: "Could not add project", description: toUserMessage(error) })
    }
  }

  return (
    <Modal
      open={open}
      dismissible
      onOpenChange={onOpenChange}
      title="Add a project"
      description="Attach a production project to debug its dev traces, or create a sandbox-only project."
      footer={
        <>
          <CloseTrigger />
          <Button type="button" disabled={submitting || !canSubmit} onClick={() => void handleSubmit()}>
            {submitting ? "Adding…" : "Add project"}
          </Button>
        </>
      }
    >
      <FormWrapper>
        <SandboxProjectChooser
          mode={effectiveMode}
          onModeChange={setMode}
          productionProjects={productionProjects}
          productionProjectId={productionProjectId}
          onProductionProjectChange={setProductionProjectId}
          newName={newProjectName}
          onNewNameChange={setNewProjectName}
          loading={isLoading}
          allowProduction={allowProduction}
        />
      </FormWrapper>
    </Modal>
  )
}
