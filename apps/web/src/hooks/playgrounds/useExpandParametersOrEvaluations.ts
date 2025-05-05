import { useCallback, useState } from 'react'

type Section = 'parameters' | 'evaluations'

export function useExpandParametersOrEvaluations({
  initialExpanded,
}: {
  initialExpanded: Section
  hasEvaluations?: boolean
}) {
  const [expandedSection, setExpandedSection] = useState<Section | null>(
    initialExpanded,
  )
  const onToggle = useCallback(
    (current: Section) => (expand: boolean) => {
      setExpandedSection(expand ? current : null)
    },
    [],
  )
  const parametersExpanded = expandedSection === 'parameters'
  const evaluationsExpanded = expandedSection === 'evaluations'
  const cssClass = {
    'grid-rows-[1fr,auto]': parametersExpanded,
    'grid-rows-[auto,1fr]': evaluationsExpanded,
    'grid-rows-2': expandedSection === null,
  }

  return {
    expandedSection,
    cssClass,
    onToggle,
    parametersExpanded,
    evaluationsExpanded,
  }
}
