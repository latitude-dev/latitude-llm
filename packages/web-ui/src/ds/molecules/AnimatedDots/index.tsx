import Text from '../../atoms/Text'

export function AnimatedDots() {
  return (
    <span className='flex flex-row items-center gap-1'>
      <Text.H6M color='foregroundMuted'>
        <span className='animate-pulse'>•</span>
      </Text.H6M>
      <Text.H6M color='foregroundMuted'>
        <span className='animate-pulse delay-250'>•</span>
      </Text.H6M>
      <Text.H6M color='foregroundMuted'>
        <span className='animate-pulse delay-500'>•</span>
      </Text.H6M>
    </span>
  )
}
