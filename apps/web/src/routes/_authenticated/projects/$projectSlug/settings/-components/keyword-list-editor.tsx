import { Button, TagsInput, Text } from "@repo/ui"

/**
 * The GitHub magic-words and redaction term lists: a {@link TagsInput} plus the
 * reset-to-defaults affordance those two lists need and no other chip field does.
 */
export function KeywordListEditor({
  label,
  value,
  onChange,
  error,
  onReset,
  disabled = false,
}: {
  label: string
  value: readonly string[]
  onChange: (next: string[]) => void
  error?: string | undefined
  onReset?: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-row items-center justify-between gap-2">
        <Text.H6 weight="medium">{label}</Text.H6>
        {onReset && !disabled ? (
          <Button variant="link" size="sm" onClick={onReset}>
            Reset to defaults
          </Button>
        ) : null}
      </div>
      <TagsInput
        value={value}
        onChange={onChange}
        errors={error ? [error] : undefined}
        disabled={disabled}
        placeholder="Add a keyword…"
      />
    </div>
  )
}
