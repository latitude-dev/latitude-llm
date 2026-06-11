import { Button, Modal, Text, useMountEffect } from "@repo/ui"
import { useRef, useState } from "react"

// Tool descriptions are prompt content, so providers put no bound on their
// length. Clamp the header to two lines and offer the full text in a modal —
// the "Show more" trigger only appears when the text actually overflows the
// clamp, measured on the rendered element (a character threshold would
// misjudge depending on viewport width).
export function ToolDescription({
  toolName,
  description,
}: {
  readonly toolName: string
  readonly description: string
}) {
  const textRef = useRef<HTMLHeadingElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [open, setOpen] = useState(false)

  useMountEffect(() => {
    const element = textRef.current
    if (!element) return
    // +1 tolerates subpixel rounding between scrollHeight and clientHeight.
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  })

  return (
    <div className="flex min-w-0 flex-col items-start">
      <Text.H5 ref={textRef} color="foregroundMuted" lineClamp={2}>
        {description}
      </Text.H5>
      {overflowing ? (
        <>
          <Button variant="link" size="sm" className="px-0" onClick={() => setOpen(true)}>
            Show more
          </Button>
          <Modal open={open} onOpenChange={setOpen} dismissible title={toolName} description="Tool description">
            <Text.H5 color="foregroundMuted" whiteSpace="preWrap">
              {description}
            </Text.H5>
          </Modal>
        </>
      ) : null}
    </div>
  )
}
