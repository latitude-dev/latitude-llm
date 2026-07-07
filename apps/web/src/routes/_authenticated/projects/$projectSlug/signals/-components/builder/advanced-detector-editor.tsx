import { Button, RichTextEditor, Text } from "@repo/ui"

/**
 * The Custom script tab is the code view of the current evaluation. While the evaluation is
 * defined by settings (conditions or judge criteria), it shows the compiled script read-only —
 * "Edit as custom script" detaches it into an editable raw script (clearing the settings forms in
 * the parent). With no settings and no script it is a blank editor for hand-writing from scratch.
 */
export function AdvancedDetectorEditor({
  compiled,
  script,
  placeholder,
  onScriptChange,
  onDetach,
}: {
  /** Script compiled client-side from the active settings draft; null when none is valid. */
  readonly compiled: { readonly kind: "rule" | "judge"; readonly script: string } | null
  readonly script: string
  readonly placeholder?: string
  readonly onScriptChange: (value: string) => void
  readonly onDetach: () => void
}) {
  const isCompiledView = script.trim().length === 0 && compiled !== null

  if (isCompiledView) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Text.H6 color="foregroundMuted">
            Compiled from your {compiled.kind === "rule" ? "conditions" : "judge criteria"}. This is the exact script
            Latitude runs.
          </Text.H6>
          <Button variant="outline" size="sm" onClick={onDetach}>
            Edit as custom script
          </Button>
        </div>
        <RichTextEditor value={compiled.script} readOnly minHeight="200px" />
        <Text.H6 color="foregroundMuted">
          Editing turns this into a custom script and clears the settings forms.
        </Text.H6>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Text.H6>Evaluation script</Text.H6>
      <RichTextEditor
        value={script}
        onChange={onScriptChange}
        minHeight="200px"
        {...(placeholder !== undefined ? { placeholder } : {})}
      />
    </div>
  )
}
