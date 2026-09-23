import { Button, Icon, Modal, Skeleton, Text, useToast } from "@repo/ui"
import { CameraIcon, CopyIcon, DownloadIcon } from "lucide-react"
import { useState } from "react"
import type { AgentScoreRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { createScoreSnapshot, downloadScoreSnapshot, type ScoreSnapshotImage } from "./agent-score-snapshot.ts"

type SnapshotState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly image: ScoreSnapshotImage }
  | { readonly status: "error" }

export function ScoreSnapshotButton({
  snapshot,
  projectName,
  projectSlug,
}: {
  readonly snapshot: AgentScoreRecord | null
  readonly projectName: string
  readonly projectSlug: string
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<SnapshotState>({ status: "idle" })
  const [isCopying, setIsCopying] = useState(false)
  const canCopy =
    typeof navigator !== "undefined" && Boolean(navigator.clipboard?.write) && typeof ClipboardItem !== "undefined"

  const generate = async () => {
    if (!snapshot) return
    setOpen(true)
    setState({ status: "loading" })
    try {
      const image = await createScoreSnapshot({ snapshot, projectSlug })
      setState({ status: "ready", image })
    } catch {
      setState({ status: "error" })
    }
  }

  const copy = async () => {
    if (state.status !== "ready") return
    setIsCopying(true)
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": state.image.blob })])
      toast({ title: "Image copied", description: "Paste it into a message or document." })
    } catch {
      toast({
        title: "Could not copy image",
        description: "Try again, or download the PNG instead.",
        variant: "destructive",
      })
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Create score snapshot"
        title="Create score snapshot"
        disabled={!snapshot || state.status === "loading"}
        onClick={() => void generate()}
      >
        <Icon icon={CameraIcon} size="sm" />
      </Button>
      <Modal.Root open={open} onOpenChange={setOpen}>
        <Modal.Content dismissible className="max-w-[520px]">
          <Modal.Header title="Score snapshot" description="Copy or download an image of the selected score." />
          <Modal.Body>
            <div className="flex flex-col gap-3">
              {state.status === "ready" ? (
                <img
                  src={state.image.previewUrl}
                  alt={`Agent Score snapshot for ${projectName}`}
                  className="aspect-square w-full rounded-lg border border-border"
                />
              ) : state.status === "error" ? (
                <div className="flex flex-col items-start gap-3 py-6">
                  <Text.H6 color="destructive">Could not generate the snapshot.</Text.H6>
                  <Button variant="outline" onClick={() => void generate()}>
                    Try again
                  </Button>
                </div>
              ) : (
                <Skeleton
                  role="status"
                  aria-label="Generating snapshot"
                  className="aspect-square w-full shrink-0 rounded-lg bg-foreground/10 motion-reduce:animate-none"
                  style={{ animationDuration: "1s" }}
                />
              )}
              {!canCopy ? (
                <Text.H6 color="foregroundMuted">
                  Image copying is unavailable in this browser. You can download the PNG instead.
                </Text.H6>
              ) : null}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={state.status !== "ready" || !canCopy}
                isLoading={isCopying}
                onClick={() => void copy()}
              >
                <Icon icon={CopyIcon} size="sm" />
                Copy image
              </Button>
              <Button
                disabled={state.status !== "ready"}
                onClick={() => {
                  if (state.status === "ready") downloadScoreSnapshot(state.image)
                }}
              >
                <Icon icon={DownloadIcon} size="sm" />
                Download PNG
              </Button>
            </div>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
