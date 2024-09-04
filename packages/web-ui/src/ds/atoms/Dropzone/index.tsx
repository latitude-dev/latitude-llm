'use client'

import {
  ChangeEvent,
  DragEvent,
  forwardRef,
  InputHTMLAttributes,
  JSX,
  useState,
} from 'react'

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

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
    }

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      onChange?.(e.dataTransfer.files)
    }

    const handleDragLeave = () => {
      setIsDragging(false)
    }

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
          ref={ref}
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
