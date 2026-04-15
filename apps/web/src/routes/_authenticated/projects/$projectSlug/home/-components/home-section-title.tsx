import { Text } from "@repo/ui"
import type { ReactNode } from "react"

/** Section heading styled like trace detail drawer section headers (label + dashed rule). */
export function HomeSectionTitle({ icon, label }: { readonly icon: ReactNode; readonly label: string }) {
  return (
    <div className="flex shrink-0 flex-row items-center gap-2 text-muted-foreground">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <hr className="mx-2 min-w-[12px] flex-1 border-t-2 border-dashed border-border" />
    </div>
  )
}
