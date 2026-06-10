import { cn, Text } from "@repo/ui"

export function ModelFilterLink({
  model,
  onClick,
  disabled,
}: {
  readonly model: string
  readonly onClick: () => void
  readonly disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={disabled ? model : `View spans for ${model}`}
      className={cn(
        "inline-flex h-7 max-w-full items-center rounded-full border border-border bg-secondary px-2.5 transition-colors",
        {
          "cursor-pointer hover:border-primary/30 hover:bg-primary/10 hover:text-foreground": !disabled,
          "cursor-default opacity-70": disabled,
        },
      )}
    >
      <Text.H5 color="foregroundMuted" noWrap>
        {model}
      </Text.H5>
    </button>
  )
}
