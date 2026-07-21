import { Alert, Button, CloseTrigger, Modal, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { adminTriggerProjectGardening } from "../../../../domains/admin/taxonomy.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"

interface TaxonomyGardeningButtonProps {
  readonly projectId: string
  readonly projectName: string
}

export function TaxonomyGardeningButton({ projectId, projectName }: TaxonomyGardeningButtonProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      await adminTriggerProjectGardening({ data: { projectId } })
      toast({
        description: `Behavior taxonomy gardening request accepted for ${projectName}.`,
      })
      setIsOpen(false)
      void router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not garden behavior taxonomy",
        description: toUserMessage(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        Garden taxonomy
      </Button>
      <Modal.Root open={isOpen} onOpenChange={setIsOpen}>
        <Modal.Content dismissible size="large">
          <Modal.Header
            title="Garden behavior taxonomy"
            description={
              <Text.H5 color="foregroundMuted">
                Update the behavior taxonomy for <span className="font-medium text-foreground">{projectName}</span>.
              </Text.H5>
            }
          />
          <Modal.Body>
            <Alert
              variant="warning"
              description="Gardening uses recent behavior observations and may be skipped or coalesced if the project is not eligible or is already scheduled."
            />
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button type="button" size="sm" disabled={isSubmitting} onClick={() => void handleConfirm()}>
              {isSubmitting ? "Gardening…" : "Garden taxonomy"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
