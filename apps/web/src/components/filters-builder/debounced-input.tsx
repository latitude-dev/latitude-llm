import { Input } from "@repo/ui"
import { XIcon } from "lucide-react"
import { type ComponentProps, useEffect, useState } from "react"
import { useDebouncedCommit } from "../../lib/hooks/useDebouncedCommit.ts"

/** Text input that reports its value after a typing pause, or right away if it unmounts first. */
export function DebouncedInput({
  value,
  onDebouncedChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  readonly value: string
  readonly onDebouncedChange: (value: string) => void
}) {
  const [local, setLocal] = useState(value)
  const [pendingChange, setPendingChange] = useState<string | null>(null)

  useDebouncedCommit(pendingChange, onDebouncedChange, 300)

  // TODO(frontend-use-effect-policy): keep local input state in sync with externally-controlled filter updates.
  useEffect(() => {
    setLocal(value)
    setPendingChange(null)
  }, [value])

  return (
    <div className="relative">
      <Input
        {...props}
        value={local}
        onChange={(e) => {
          setLocal(e.target.value)
          setPendingChange(e.target.value)
        }}
      />
      {local ? (
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={() => {
            setLocal("")
            setPendingChange(null)
            onDebouncedChange("")
          }}
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}
