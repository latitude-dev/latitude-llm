import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { LatteSuggestion } from '@latitude-data/constants/latte'

export function Suggestions({
  suggestions,
}: {
  suggestions: LatteSuggestion[]
}) {
  return (
    <div
      className={cn(
        'flex h-full max-h-full transition-all ease-in-out duration-300 custom-scrollbar',
        {
          'border-l border-border w-full': !!suggestions.length,
          'w-[0%]': !suggestions.length,
        },
      )}
    >
      {suggestions.map((suggestion, index) => (
        <Text.H5 key={index}>{JSON.stringify(suggestion)}</Text.H5>
      ))}
    </div>
  )
}
