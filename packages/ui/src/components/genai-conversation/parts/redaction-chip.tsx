import { Tooltip } from "../../tooltip/tooltip.tsx"
import { redactionChipExplanation, redactionChipLabel } from "./redaction-placeholders.ts"

export function RedactionChip({ label }: { readonly label: string }) {
  return (
    <Tooltip
      asChild
      trigger={
        // A button rather than a styled span: the explanation has to be reachable without a
        // pointer, and the accessible name has to carry it because a tooltip is not announced.
        <button
          type="button"
          aria-label={redactionChipExplanation(label)}
          className="not-prose mx-px inline-block cursor-default select-none bg-foreground/85 px-1.5 py-[0.3em] align-middle font-mono text-[0.75em] leading-[1.15] tracking-wide text-muted-foreground uppercase"
        >
          {redactionChipLabel(label)}
        </button>
      }
    >
      {redactionChipExplanation(label)}
    </Tooltip>
  )
}
