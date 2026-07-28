import { Tooltip } from "../../tooltip/tooltip.tsx"
import { redactionChipExplanation, redactionChipLabel } from "./redaction-placeholders.ts"

/**
 * A censor bar carrying its category, rather than an opaque block. The bar is the right
 * visual metaphor, but occluding the label would hide the only useful part and imply
 * there is something underneath to reveal — redaction is destructive and there is not.
 */
export function RedactionChip({ label }: { readonly label: string }) {
  return (
    <Tooltip
      asChild
      trigger={
        <span className="not-prose mx-px inline-flex cursor-default select-none items-baseline rounded-[3px] bg-foreground/85 px-1 font-mono text-[0.7em] tracking-wide text-background uppercase">
          {redactionChipLabel(label)}
        </span>
      }
    >
      {redactionChipExplanation(label)}
    </Tooltip>
  )
}
