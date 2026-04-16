import { ClipboardCopyIcon, MessageSquarePlusIcon } from "lucide-react"
import { type ReactNode, use, useRef } from "react"
import { Button } from "../button/button.tsx"
import { Icon } from "../icons/icons.tsx"
import { Popover, PopoverAnchor, PopoverContent } from "../popover/primitives.tsx"
import { useToast } from "../toast/useToast.ts"
import { TextSelectionContext } from "./text-selection.tsx"

/**
 * Thin wrapper around Radix Popover that anchors to a DOM Range via
 * virtualRef.  Radix + Floating UI handle scroll tracking and collision
 * avoidance automatically.
 */
function SelectionPopover({
  range,
  onDismiss,
  children,
}: {
  readonly range: Range
  readonly onDismiss: () => void
  readonly children: ReactNode
}) {
  const virtualRef = useRef<{ getBoundingClientRect: () => DOMRect }>({
    getBoundingClientRect: () => range.getBoundingClientRect(),
  })
  virtualRef.current = { getBoundingClientRect: () => range.getBoundingClientRect() }

  return (
    <Popover open>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        side="bottom"
        sideOffset={6}
        align="center"
        updatePositionStrategy="always"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={onDismiss}
        className="w-auto p-1"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

export function SelectionActionPopover() {
  const ctx = use(TextSelectionContext)
  const { toast } = useToast()
  const contentRef = useRef<HTMLDivElement>(null)
  if (!ctx) return null

  const { detected, resolveAndAnnotate, resolveAndCopy, clearSelection } = ctx

  if (!detected?.isSinglePart) return null

  const selectionRect = detected.range.getBoundingClientRect()
  if (selectionRect.width === 0 && selectionRect.height === 0) return null

  const handleAnnotate = () => {
    const el = contentRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      resolveAndAnnotate({ x: rect.left, y: rect.top })
    } else {
      resolveAndAnnotate()
    }
  }

  const handleCopy = () => {
    resolveAndCopy()
    toast({ title: "Copied to clipboard" })
  }

  return (
    <SelectionPopover range={detected.range} onDismiss={clearSelection}>
      <div ref={contentRef} data-selection-popover className="flex items-center gap-0.5">
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          <Icon icon={ClipboardCopyIcon} size="sm" />
          Copy
        </Button>
        <Button variant="default-soft" size="sm" onClick={handleAnnotate}>
          <Icon icon={MessageSquarePlusIcon} size="sm" />
          Annotate
        </Button>
      </div>
    </SelectionPopover>
  )
}
