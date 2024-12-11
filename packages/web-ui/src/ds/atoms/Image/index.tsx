import { forwardRef, ImgHTMLAttributes } from 'react'
import { cn } from '../../../lib/utils'

export type ImageProps = ImgHTMLAttributes<HTMLImageElement>

export const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  { className, ...props },
  ref,
) {
  return (
    <img
      onError={(element) => {
        element.currentTarget.src = '/placeholder.png'
        element.currentTarget.onerror = null
      }}
      fetchPriority='auto'
      loading='lazy'
      decoding='async'
      className={cn(
        'aspect-auto h-auto w-auto bg-muted object-cover shadow-sm',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
