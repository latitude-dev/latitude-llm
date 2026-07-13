import { Button, Modal, useMountEffect } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { READ_ONLY_PROJECT_MODAL_EVENT } from "./read-only-project-modal.ts"

/**
 * App-root listener + modal for read-only (showcase) write attempts.
 *
 * Any blocked write surfaces a `ReadOnlyProjectError`; the mutation-error sink
 * (and the write-gate client middleware) call `openReadOnlyProjectModal`, which
 * dispatches the {@link READ_ONLY_PROJECT_MODAL_EVENT} this component listens
 * for. Mounted once at the root so it works from every route, including the
 * showcase. The modal explains the demo is read-only and points the user at
 * creating their own project.
 */
export function ReadOnlyProjectModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useMountEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(READ_ONLY_PROJECT_MODAL_EVENT, onOpen)
    return () => window.removeEventListener(READ_ONLY_PROJECT_MODAL_EVENT, onOpen)
  })

  const createOwnProject = () => {
    setOpen(false)
    void router.navigate({ to: "/" })
  }

  return (
    <Modal
      open={open}
      dismissible
      onOpenChange={setOpen}
      title="This is a demo project"
      description="The Latitude Demo is read-only. Explore everything you like — but to make changes, create your own project and start sending your own data."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Keep exploring
          </Button>
          <Button onClick={createOwnProject}>Create your own project</Button>
        </div>
      }
    />
  )
}
