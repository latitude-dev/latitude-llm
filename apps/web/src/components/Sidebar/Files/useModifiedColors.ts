import {
  MODIFICATION_BACKGROUNDS,
  MODIFICATION_BACKGROUNDS_HOVER,
  MODIFICATION_COLORS,
} from '@latitude-data/web-ui/molecules/DocumentChange'
import { useMemo } from 'react'
import { ModifiedDocumentType } from '@latitude-data/core/constants'

export function useModifiedColors({
  changeType,
}: {
  changeType: ModifiedDocumentType | undefined
}) {
  const color = changeType ? MODIFICATION_COLORS[changeType] : 'foreground'
  const selectedBackgroundColor = changeType
    ? MODIFICATION_BACKGROUNDS[changeType]
    : MODIFICATION_BACKGROUNDS[ModifiedDocumentType.UpdatedPath]
  const selectedBackgroundColorHover = changeType
    ? MODIFICATION_BACKGROUNDS_HOVER[changeType]
    : MODIFICATION_BACKGROUNDS_HOVER[ModifiedDocumentType.UpdatedPath]

  return useMemo(
    () => ({ color, selectedBackgroundColor, selectedBackgroundColorHover }),
    [color, selectedBackgroundColor, selectedBackgroundColorHover],
  )
}
