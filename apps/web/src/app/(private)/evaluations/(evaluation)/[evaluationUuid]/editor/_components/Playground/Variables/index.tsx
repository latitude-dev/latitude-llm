'use client'
import { ProviderLogDto } from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'

import { InputSection } from './components/InputSection'
import { VariableSection } from './components/VariableSection'
import { useVariablesData } from './hooks/useVariablesData'
import { PARAMETERS } from './utils/constants'

export const Variables = ({ providerLog }: { providerLog: ProviderLogDto }) => {
  const {
    variableSections,
    inputSections,
    isMessagesPinned,
    setIsMessagesPinned,
    isPopoverOpen,
    setIsPopoverOpen,
  } = useVariablesData(providerLog)

  if (!providerLog) return null

  const collapsedContent = (
    <div className='flex flex-wrap gap-2'>
      {PARAMETERS.map((param) => (
        <Badge key={param} variant='accent'>
          {param}
        </Badge>
      ))}
    </div>
  )

  const expandedContent = (
    <div className='flex flex-col gap-4'>
      {variableSections.map((section) => (
        <VariableSection
          key={section.title}
          {...section}
          isPopoverOpen={isPopoverOpen}
          setIsPopoverOpen={setIsPopoverOpen}
          isPinned={isMessagesPinned}
          onUnpin={() => setIsMessagesPinned(false)}
          popoverContent={section.popover}
        />
      ))}
      {inputSections.map((section) => (
        <InputSection key={section.title} {...section} />
      ))}
    </div>
  )

  return (
    <CollapsibleBox
      title='Parameters'
      icon='braces'
      initialExpanded={true}
      collapsedContent={collapsedContent}
      expandedContent={expandedContent}
      expandedHeight='720px'
    />
  )
}
