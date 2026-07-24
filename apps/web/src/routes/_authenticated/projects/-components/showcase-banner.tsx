import { Button, Icon, Modal, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useRouter } from "@tanstack/react-router"
import { EyeIcon } from "lucide-react"
import { useState } from "react"
import { dismissShowcase } from "../../../../domains/organizations/organizations.functions.ts"
import { getQueryClient } from "../../../../lib/data/query-client.tsx"
import { toUserMessage } from "../../../../lib/errors.ts"
import { createFormSubmitHandler } from "../../../../lib/form-server-action.ts"

export function ShowcaseBanner() {
  return (
    <div className="relative flex shrink-0 items-center justify-between gap-4 px-4 py-2">
      <span className="shrink-0" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2">
        <Icon icon={EyeIcon} size="sm" color="white" className="opacity-90" />
        <Text.H6 color="white" className="opacity-95">
          Read-only demo
        </Text.H6>
      </div>
      <div className="pointer-events-auto shrink-0">
        <RemoveDemoButton />
      </div>
    </div>
  )
}

function RemoveDemoButton() {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)

  const form = useForm({
    defaultValues: {},
    onSubmit: createFormSubmitHandler(async () => dismissShowcase(), {
      resetOnSuccess: false,
      onSuccess: async () => {
        await getQueryClient().invalidateQueries({ queryKey: ["projects"] })
        // `$projectSlug` has `staleTime: Infinity`, so invalidate the router
        // loader cache too — otherwise browser Back would re-render the
        // dismissed demo from stale `isShowcase: true` loader data.
        await router.invalidate()
        await router.navigate({ to: "/" })
      },
      onError: (error) => {
        toast({ variant: "destructive", description: toUserMessage(error) })
      },
    }),
  })

  return (
    <>
      <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => setOpen(true)}>
        Remove demo
      </Button>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <Modal
            open={open}
            dismissible
            onOpenChange={(next) => {
              if (!next && !isSubmitting) setOpen(false)
            }}
            title="Remove the demo?"
            description="This removes the demo for everyone on your team, not just you. Every member of your organization loses access to it. Support can restore it later if you need it back."
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={isSubmitting} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={isSubmitting}
                  isLoading={isSubmitting}
                  onClick={() => void form.handleSubmit()}
                >
                  Remove demo
                </Button>
              </div>
            }
          />
        )}
      </form.Subscribe>
    </>
  )
}
