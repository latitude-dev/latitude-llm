import { Icon, Text } from "@repo/ui"
import { DatabaseIcon } from "lucide-react"

/** Store header for a memory records master-detail: `[db] <store id> (N)`. */
export function RecordsHeader({ storeId, count }: { readonly storeId?: string; readonly count: number }) {
  return (
    <div className="flex flex-row items-center gap-2 bg-secondary px-3 py-2">
      <Icon icon={DatabaseIcon} size="xs" color="foregroundMuted" />
      {storeId ? (
        <div className="flex min-w-0 flex-1">
          <Text.H6 color="foregroundMuted" ellipsis noWrap>
            {storeId}
          </Text.H6>
        </div>
      ) : null}
      <Text.H6 color="foregroundMuted" noWrap>{`(${count})`}</Text.H6>
    </div>
  )
}
