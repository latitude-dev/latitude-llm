import Text from '../../atoms/Text'
import { TextColor } from '../../tokens'

export function AnimatedDots(
  { color }: { color?: TextColor } = { color: 'foregroundMuted' },
) {
  return (
    <span className='flex flex-row items-center gap-1'>
      <Text.H6M color={color}>
        <span className='animate-pulse'>•</span>
      </Text.H6M>
      <Text.H6M color={color}>
        <span className='animate-pulse delay-250'>•</span>
      </Text.H6M>
      <Text.H6M color={color}>
        <span className='animate-pulse delay-500'>•</span>
      </Text.H6M>
    </span>
  )
}
