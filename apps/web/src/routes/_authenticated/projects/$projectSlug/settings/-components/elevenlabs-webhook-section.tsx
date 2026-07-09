import { Button, CopyableText, ElevenlabsIcon, FormField, Input, Modal, Text, useToast } from "@repo/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  disableElevenlabsWebhook,
  enableElevenlabsWebhook,
  getElevenlabsWebhook,
} from "../../../../../../domains/elevenlabs/elevenlabs.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { IntegrationCard } from "./integration-card.tsx"

const QUERY_KEY = ["elevenlabs-webhook"] as const

export function ElevenlabsWebhookSection({ projectId }: { readonly projectId: string }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [connectOpen, setConnectOpen] = useState(false)
  const [signingSecret, setSigningSecret] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: [...QUERY_KEY, projectId],
    queryFn: () => getElevenlabsWebhook({ data: { projectId } }),
  })

  const enableMutation = useMutation({
    mutationFn: () => enableElevenlabsWebhook({ data: { projectId, signingSecret } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, projectId] })
      setConnectOpen(false)
      setSigningSecret("")
      toast({ description: "ElevenLabs webhook connected" })
    },
    onError: (error) => {
      toast({ variant: "destructive", description: toUserMessage(error) })
    },
  })

  const disableMutation = useMutation({
    mutationFn: () => disableElevenlabsWebhook({ data: { projectId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, projectId] })
      toast({ description: "ElevenLabs webhook disconnected" })
    },
    onError: (error) => {
      toast({ variant: "destructive", description: toUserMessage(error) })
    },
  })

  return (
    <>
      <IntegrationCard
        icon={ElevenlabsIcon}
        title="ElevenLabs Agents"
        subtitle={
          data
            ? "Post-call OpenTelemetry webhooks are connected for this project."
            : "Receive post-call OpenTelemetry traces from ElevenLabs-managed agents."
        }
        actions={
          isLoading ? null : data ? (
            <div className="flex flex-row items-center gap-2">
              <Button variant="outline" onClick={() => setConnectOpen(true)}>
                Rotate secret
              </Button>
              <Button
                variant="destructive"
                isLoading={disableMutation.isPending}
                onClick={() => disableMutation.mutate()}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <Button onClick={() => setConnectOpen(true)}>Connect</Button>
          )
        }
      />

      {data ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <Text.H6 color="foregroundMuted">Webhook URL</Text.H6>
          <CopyableText value={data.webhookUrl} tooltip="Copy webhook URL" />
          <Text.H6 color="foregroundMuted" className="mt-2">
            In ElevenLabs, create a workspace post-call webhook pointing at this URL, enable the Transcript event, and
            set transcript format to OpenTelemetry.
          </Text.H6>
        </div>
      ) : null}

      <Modal open={connectOpen} onOpenChange={setConnectOpen} title="Connect ElevenLabs webhook">
        <div className="flex flex-col gap-4">
          <Text.H6 color="foregroundMuted">
            Paste the signing secret from your ElevenLabs workspace webhook. Latitude verifies the ElevenLabs-Signature
            header on every delivery.
          </Text.H6>
          <FormField label="Webhook signing secret">
            <Input
              type="password"
              value={signingSecret}
              onChange={(event) => setSigningSecret(event.target.value)}
              placeholder="whsec_..."
              autoComplete="off"
            />
          </FormField>
          <div className="flex flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setConnectOpen(false)}>
              Cancel
            </Button>
            <Button
              isLoading={enableMutation.isPending}
              disabled={signingSecret.length < 8}
              onClick={() => enableMutation.mutate()}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
