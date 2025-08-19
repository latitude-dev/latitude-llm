import { Text } from '../../atoms/Text'
import { TextColor } from '../../tokens'

export function AnimatedDots(
  { color }: { color?: TextColor } = { color: 'foregroundMuted' },
) {
  return (
    <span className='flex flex-row items-center justify-center'>
      <Text.H6M color={color} userSelect={false}>
        <span className='animate-pulse'>•</span>
      </Text.H6M>
      <Text.H6M color={color} userSelect={false}>
        <span className='animate-pulse delay-250'>•</span>
      </Text.H6M>
      <Text.H6M color={color} userSelect={false}>
        <span className='animate-pulse delay-500'>•</span>
      </Text.H6M>
    </span>
  )
}
