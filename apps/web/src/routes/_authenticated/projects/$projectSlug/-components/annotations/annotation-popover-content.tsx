import { PopoverContent } from "@repo/ui"
import type { ComponentProps, ReactNode } from "react"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { AnnotationCard } from "./annotation-card.tsx"
import { AnnotationInput } from "./annotation-input.tsx"

interface AnnotationPopoverContentProps {
  readonly projectId: string
  readonly annotations: readonly AnnotationRecord[]
  readonly showCreateForm?: boolean
  readonly createInitialPassed?: boolean | null
  readonly createAutoFocus?: boolean
  readonly isCreateLoading?: boolean
  readonly isUpdateLoading?: boolean
  readonly onSave: (data: { passed: boolean; comment: string; issueId: string | null }) => void
  readonly onUpdate: (annotationId: string, data: { passed: boolean; comment: string; issueId: string | null }) => void
  readonly onDelete?: () => void
}

export function AnnotationPopoverContent({
  projectId,
  annotations,
  showCreateForm = true,
  createInitialPassed = null,
  createAutoFocus = false,
  isCreateLoading = false,
  isUpdateLoading = false,
  onSave,
  onUpdate,
  onDelete,
}: AnnotationPopoverContentProps) {
  return (
    <div className="flex flex-col gap-2">
      {showCreateForm && (
        <AnnotationInput
          projectId={projectId}
          isLoading={isCreateLoading}
          initialPassed={createInitialPassed}
          autoFocus={createAutoFocus}
          onSave={onSave}
        />
      )}

      {annotations.length > 0 && (
        <div className="flex flex-col gap-2">
          {annotations.map((annotation) => (
            <AnnotationCard
              key={annotation.id}
              annotation={annotation}
              projectId={projectId}
              isUpdateLoading={isUpdateLoading}
              onUpdate={(data) => onUpdate(annotation.id, data)}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const ANNOTATION_POPOVER_CONTENT_CLASS =
  "w-[400px] max-h-[70vh] overflow-y-auto p-1 rounded-2xl bg-secondary border-0 shadow"

function handleInteractOutside(e: Event) {
  const target = e.target as HTMLElement
  if (target.closest("[data-annotation-navigation]")) {
    e.preventDefault()
  }
}

type AnnotationPopoverWrapperProps = Omit<ComponentProps<typeof PopoverContent>, "className" | "onInteractOutside"> & {
  children: ReactNode
}

export function AnnotationPopoverWrapper({ children, ...props }: AnnotationPopoverWrapperProps) {
  return (
    <PopoverContent
      side="bottom"
      align="start"
      className={ANNOTATION_POPOVER_CONTENT_CLASS}
      onInteractOutside={handleInteractOutside}
      {...props}
    >
      {children}
    </PopoverContent>
  )
}
