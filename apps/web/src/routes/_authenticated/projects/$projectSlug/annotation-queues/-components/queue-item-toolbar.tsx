import { QUEUE_REVIEW_HOTKEYS } from "@domain/annotation-queues"
import { Button, Icon, Modal, Text, Tooltip } from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { useNavigate } from "@tanstack/react-router"
import { ArrowBigLeftIcon, ArrowBigRightIcon, Plus } from "lucide-react"
import { useState } from "react"
import { HotkeyBadge } from "../../../../../../components/hotkey-badge.tsx"
import { useQueueItemNavigation } from "../../../../../../domains/annotation-queue-items/annotation-queue-items.collection.ts"
import { AddToDatasetModal } from "../../datasets/-components/add-to-dataset-modal.tsx"

interface QueueItemToolbarProps {
  readonly projectSlug: string
  readonly projectId: string
  readonly queueId: string
  readonly itemId: string
  readonly traceId: string
  readonly isCompleted: boolean
}

export function QueueItemToolbar({
  projectSlug,
  projectId,
  queueId,
  itemId,
  traceId,
  isCompleted,
}: QueueItemToolbarProps) {
  const [datasetModalOpen, setDatasetModalOpen] = useState(false)
  const [allCompleteModalOpen, setAllCompleteModalOpen] = useState(false)
  const navigate = useNavigate()

  const {
    previousItemId,
    nextItemId,
    currentIndex,
    totalItems,
    navigateToPrevious,
    navigateToNext,
    complete,
    uncomplete,
    isCompleting,
    isUncompleting,
  } = useQueueItemNavigation({
    projectSlug,
    projectId,
    queueId,
    itemId,
    onQueueAllComplete: () => setAllCompleteModalOpen(true),
  })

  const handleCompletionToggle = () => {
    if (isCompleted) {
      uncomplete()
    } else {
      complete()
    }
  }

  useHotkeys([
    {
      hotkey: QUEUE_REVIEW_HOTKEYS.previousItem,
      callback: navigateToPrevious,
      options: { enabled: !!previousItemId },
    },
    {
      hotkey: QUEUE_REVIEW_HOTKEYS.nextItem,
      callback: navigateToNext,
      options: { enabled: !!nextItemId },
    },
    {
      hotkey: QUEUE_REVIEW_HOTKEYS.markComplete,
      callback: handleCompletionToggle,
      options: { enabled: !isCompleting && !isUncompleting },
    },
    {
      hotkey: QUEUE_REVIEW_HOTKEYS.addToDataset,
      callback: () => setDatasetModalOpen(true),
    },
  ])

  const selection = { mode: "selected" as const, rowIds: [traceId] }
  const isBusy = isCompleting || isUncompleting

  const completionButton = (
    <Button
      variant={isCompleted ? "outline" : "default"}
      size="sm"
      onClick={handleCompletionToggle}
      disabled={isBusy}
      isLoading={isBusy}
    >
      {isCompleted ? "Uncomplete" : "Complete"}
      <HotkeyBadge hotkey={QUEUE_REVIEW_HOTKEYS.markComplete} />
    </Button>
  )

  return (
    <>
      <div className="flex items-center justify-between border-t bg-background px-4 py-2">
        <Button variant="outline" size="sm" onClick={() => setDatasetModalOpen(true)}>
          <Icon icon={Plus} size="sm" />
          Add to dataset
          <HotkeyBadge hotkey={QUEUE_REVIEW_HOTKEYS.addToDataset} />
        </Button>

        <div className="flex items-center gap-2">
          <Text.H6 color="foregroundMuted">
            {currentIndex} of {totalItems}
          </Text.H6>

          <Button variant="outline" onClick={navigateToPrevious} disabled={!previousItemId} aria-label="Previous item">
            <Icon icon={ArrowBigLeftIcon} size="sm" color="foreground" />
            <HotkeyBadge hotkey={QUEUE_REVIEW_HOTKEYS.previousItem} />
          </Button>

          <Button variant="outline" onClick={navigateToNext} disabled={!nextItemId} aria-label="Next item">
            <HotkeyBadge hotkey={QUEUE_REVIEW_HOTKEYS.nextItem} />
            <Icon icon={ArrowBigRightIcon} size="sm" />
          </Button>

          {isCompleted ? (
            completionButton
          ) : (
            <Tooltip trigger={completionButton} asChild>
              Mark as complete and move to the next pending item
            </Tooltip>
          )}
        </div>
      </div>

      <AddToDatasetModal
        open={datasetModalOpen}
        onOpenChange={setDatasetModalOpen}
        projectId={projectId}
        selection={selection}
        selectedCount={1}
        onSuccess={() => setDatasetModalOpen(false)}
      />

      <Modal
        open={allCompleteModalOpen}
        onOpenChange={setAllCompleteModalOpen}
        title="🎉 All items completed!"
        description="There are no more pending items in this annotation queue."
        dismissible
        footer={
          <>
            <Button variant="outline" onClick={() => setAllCompleteModalOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setAllCompleteModalOpen(false)
                navigate({
                  to: "/projects/$projectSlug/annotation-queues/$queueId",
                  params: { projectSlug, queueId },
                })
              }}
            >
              View list
            </Button>
          </>
        }
      />
    </>
  )
}
