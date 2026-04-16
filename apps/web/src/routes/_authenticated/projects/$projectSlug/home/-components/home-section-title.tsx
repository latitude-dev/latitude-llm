import { Text } from "@repo/ui"

/** Section heading styled like trace detail drawer section headers (label + dashed rule). */
export function HomeSectionTitle({ label }: { readonly label: string }) {
  return (
    <div className="flex shrink-0 flex-row items-center gap-2 text-muted-foreground">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <div className="flex min-w-[12px] flex-1 flex-row px-2">
        <hr className="w-full border-t-2 border-dashed border-border" />
      </div>
    </div>
  )
}
