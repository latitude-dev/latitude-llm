import { DetailDrawer, DetailSummary, Text } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useRef, useSyncExternalStore } from "react"

import { useAnnotationQueueItem } from "../../../../../../../domains/annotation-queue-items/annotation-queue-items.collection.ts"
import { useAnnotationsByTrace } from "../../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../../domains/annotations/annotations.functions.ts"
import { useProjectsCollection } from "../../../../../../../domains/projects/projects.collection.ts"
import { useTraceDetail } from "../../../../../../../domains/traces/traces.collection.ts"
import { useParamState } from "../../../../../../../lib/hooks/useParamState.ts"
import {
  isGlobalAnnotation,
  useAnnotationNavigation,
} from "../../../-components/annotations/hooks/use-annotation-navigation.ts"
import type { TextSelectionPopoverControls } from "../../../-components/annotations/hooks/use-annotation-popover.ts"
import { TraceAnnotationsList } from "../../../-components/annotations/trace-annotations-list.tsx"
import { ConversationTab } from "../../../-components/trace-detail-drawer/tabs/conversation-tab.tsx"
import { TraceTab } from "../../../-components/trace-detail-drawer/tabs/trace-tab.tsx"
import { QueueItemLeafBreadcrumb } from "../../-components/queue-item-leaf-breadcrumb.tsx"
import { QueueItemStatusBadge } from "../../-components/queue-item-status-badge.tsx"
import { QueueItemToolbar } from "../../-components/queue-item-toolbar.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/annotation-queues/$queueId/items/$itemId")({
  staticData: {
    breadcrumb: QueueItemLeafBreadcrumb,
    collapseSidebar: true,
  },
  component: AnnotationQueueItemDetailPage,
})

const LEFT_MIN_WIDTH = 300
const LEFT_DEFAULT_WIDTH = 300
const RIGHT_MIN_WIDTH = 400

function subscribeToResize(cb: () => void) {
  window.addEventListener("resize", cb)
  return () => window.removeEventListener("resize", cb)
}

function getWindowWidth() {
  return typeof window !== "undefined" ? window.innerWidth : 1200
}

function useWindowWidth() {
  return useSyncExternalStore(subscribeToResize, getWindowWidth, () => 1200)
}

function AnnotationQueueItemDetailPage() {
  const { projectSlug, queueId, itemId } = Route.useParams()
  const windowWidth = useWindowWidth()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textSelectionPopoverControlsRef = useRef<TextSelectionPopoverControls | null>(null)
  const [selectedAnnotationId, setSelectedAnnotationId] = useParamState("annotationId", "")

  const { data: project, isLoading: projectLoading } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const projectId = project?.id ?? ""

  const { data: itemDetail, isLoading: itemLoading } = useAnnotationQueueItem({
    projectId,
    queueId,
    itemId,
  })

  const traceId = itemDetail?.traceId ?? ""
  const hasTraceParams = projectId.length > 0 && traceId.length > 0

  const { data: traceDetail, isLoading: traceDetailLoading } = useTraceDetail({
    projectId,
    traceId,
    enabled: hasTraceParams,
  })

  const { data: annotationsData } = useAnnotationsByTrace({
    projectId,
    traceId,
    draftMode: "include",
    enabled: hasTraceParams,
  })

  const { scrollToAnnotation } = useAnnotationNavigation({
    scrollContainerRef,
    textSelectionPopoverControlsRef,
  })

  const hasHandledDeepLinkRef = useRef(false)

  function handleAnnotationClick(annotation: AnnotationRecord) {
    if (isGlobalAnnotation(annotation)) return
    setSelectedAnnotationId(annotation.id)
    scrollToAnnotation(annotation)
  }

  useEffect(() => {
    if (hasHandledDeepLinkRef.current) return
    if (!selectedAnnotationId || !annotationsData?.items || !traceDetail) return

    const annotation = annotationsData.items.find((a) => a.id === selectedAnnotationId)
    if (annotation) {
      hasHandledDeepLinkRef.current = true
      scrollToAnnotation(annotation)
    }
  }, [selectedAnnotationId, annotationsData, traceDetail, scrollToAnnotation])

  const leftMaxWidth = Math.max(LEFT_MIN_WIDTH, Math.floor(windowWidth * 0.4))
  const rightDefaultWidth = Math.max(RIGHT_MIN_WIDTH, Math.floor(windowWidth * 0.3))
  const rightMaxWidth = Math.max(RIGHT_MIN_WIDTH, Math.floor(windowWidth * 0.5))

  const isRecordLoading = itemLoading || (hasTraceParams && traceDetailLoading)
  const isDetailLoading = hasTraceParams && traceDetailLoading
  const traceNotFound = hasTraceParams && !traceDetailLoading && traceDetail === null

  if (projectLoading || !projectId) {
    return null
  }

  if (projectId.length > 0 && !itemLoading && itemDetail === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Text.H4>Queue item not found</Text.H4>
        <Text.H6 color="foregroundMuted">This item may have been removed or you may not have access.</Text.H6>
        <Link
          to="/projects/$projectSlug/annotation-queues/$queueId"
          params={{ projectSlug, queueId }}
          className="text-sm text-primary hover:underline"
        >
          ← Back to queue
        </Link>
      </div>
    )
  }

  if (traceNotFound) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Text.H4>Trace not found</Text.H4>
        <Text.H6 color="foregroundMuted">The trace associated with this item could not be found.</Text.H6>
        <Link
          to="/projects/$projectSlug/annotation-queues/$queueId"
          params={{ projectSlug, queueId }}
          className="text-sm text-primary hover:underline"
        >
          ← Back to queue
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex flex-row flex-1 min-h-0 overflow-hidden">
        <DetailDrawer
          storeKey="aq-item-left-panel"
          minWidth={LEFT_MIN_WIDTH}
          defaultWidth={LEFT_DEFAULT_WIDTH}
          maxWidth={leftMaxWidth}
          resizeFrom="right"
        >
          <div className="flex flex-col gap-6 py-6 px-4 border-b border-border">
            <DetailSummary
              items={[
                {
                  label: "Trace",
                  value: itemDetail?.traceDisplayName,
                  isLoading: itemLoading,
                },
              ]}
            />
            <div className="flex flex-col gap-0.5">
              <Text.H6 color="foregroundMuted">Status</Text.H6>
              {itemLoading ? (
                <div className="h-5 w-20 bg-muted animate-pulse rounded" />
              ) : itemDetail ? (
                <div>
                  <QueueItemStatusBadge row={itemDetail} />
                </div>
              ) : null}
            </div>
          </div>
          <TraceTab
            traceId={traceId}
            traceRecord={traceDetail ?? undefined}
            traceDetail={traceDetail}
            isRecordLoading={isRecordLoading}
            isDetailLoading={isDetailLoading}
            defaultSectionsOpen={false}
          />
        </DetailDrawer>

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <ConversationTab
            isActive
            traceDetail={traceDetail}
            isDetailLoading={isDetailLoading || itemLoading}
            projectId={projectId}
            scrollContainerRef={scrollContainerRef}
            textSelectionPopoverControlsRef={textSelectionPopoverControlsRef}
            onPopoverClose={() => setSelectedAnnotationId("")}
          />
        </div>

        <DetailDrawer
          minWidth={RIGHT_MIN_WIDTH}
          defaultWidth={rightDefaultWidth}
          maxWidth={rightMaxWidth}
          resizeFrom="left"
        >
          <TraceAnnotationsList
            projectId={projectId}
            traceId={traceId}
            queueId={queueId}
            selectedAnnotationId={selectedAnnotationId}
            onAnnotationClick={handleAnnotationClick}
          />
        </DetailDrawer>
      </div>

      <QueueItemToolbar
        projectSlug={projectSlug}
        projectId={projectId}
        queueId={queueId}
        itemId={itemId}
        traceId={traceId}
        isCompleted={!!itemDetail?.completedAt}
      />
    </div>
  )
}
