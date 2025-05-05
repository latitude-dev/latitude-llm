import { ModifiedDocumentType } from '@latitude-data/core/browser'
import {
  MODIFICATION_BACKGROUNDS,
  MODIFICATION_COLORS,
} from '@latitude-data/web-ui/molecules/DocumentChange'
import { useMemo } from 'react'

export function useModifiedColors({
  changeType,
}: {
  changeType: ModifiedDocumentType | undefined
}) {
  const color = changeType ? MODIFICATION_COLORS[changeType] : 'foreground'
  const selectedBackgroundColor = changeType
    ? MODIFICATION_BACKGROUNDS[changeType]
    : MODIFICATION_BACKGROUNDS[ModifiedDocumentType.UpdatedPath]

  return useMemo(
    () => ({ color, selectedBackgroundColor }),
    [color, selectedBackgroundColor],
  )
}
