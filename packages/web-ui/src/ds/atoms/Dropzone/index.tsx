'use client'

import {
  ChangeEvent,
  DragEvent,
  forwardRef,
  InputHTMLAttributes,
  JSX,
  useCallback,
  useRef,
  useState,
} from 'react'

import { useCombinedRefs } from '../../../lib/hooks/useCombineRefs'

export type DropzoneProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'children'
> & {
  onChange?: (files: FileList | null) => void
  children: ({ isDragging }: { isDragging: boolean }) => JSX.Element
}

export const Dropzone = forwardRef<HTMLInputElement, DropzoneProps>(
  ({ onChange, children, ...props }, ref) => {
    const [isDragging, setIsDragging] = useState(false)
    const internalRef = useRef<HTMLInputElement>(null)
    const combineRef = useCombinedRefs(ref, internalRef)

    const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
    }, [])

    const handleDrop = useCallback(
      (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
        onChange?.(e.dataTransfer.files)
        if (!internalRef.current) return

        // Set files in input because then we can submit a real form
        internalRef.current.files = e.dataTransfer.files
      },
      [onChange],
    )

    const handleDragLeave = useCallback(() => {
      setIsDragging(false)
    }, [])

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      onChange?.(e.target.files)
    }
    return (
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragLeave={handleDragLeave}
      >
        {children({ isDragging })}
        <input
          ref={combineRef}
          type='file'
          className='hidden'
          onChange={handleChange}
          {...props}
        />
      </div>
    )
  },
)

Dropzone.displayName = 'Dropzone'
