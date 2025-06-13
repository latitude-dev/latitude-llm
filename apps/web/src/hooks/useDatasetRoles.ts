import { type DatasetColumnRole } from '@latitude-data/core/browser'
import { BackgroundColor, colors } from '@latitude-data/web-ui/tokens'
import { useCallback, useMemo } from 'react'

type RoleStyle = { bgColor: BackgroundColor }
type RoleStyles = {
  label: RoleStyle
  metadata: RoleStyle
}

const ROLE_STYLES: RoleStyles = {
  label: { bgColor: 'accent' },
  metadata: { bgColor: 'backgroundSecondary' },
}
export function useDatasetRole() {
  const getStyleForRole = useCallback((role: DatasetColumnRole) => {
    let styles
    switch (role) {
      case 'label':
        styles = ROLE_STYLES.label
        break
      case 'metadata':
        styles = ROLE_STYLES.metadata
        break
    }
    return styles
  }, [])

  const backgroundCssClasses = useMemo(() => {
    const metadataColor = getStyleForRole('metadata')!.bgColor
    const metadataCssClass = colors.backgrounds[metadataColor]
    const labelColor = getStyleForRole('label')!.bgColor
    const labelCssClass = colors.backgrounds[labelColor]
    const colorsCssClassByRole: Partial<Record<DatasetColumnRole, string>> = {
      metadata: metadataCssClass,
      label: labelCssClass,
    }
    return colorsCssClassByRole
  }, [getStyleForRole])

  return { getStyleForRole, backgroundCssClasses }
}

export type DatasetRoleStyle = ReturnType<typeof useDatasetRole>
