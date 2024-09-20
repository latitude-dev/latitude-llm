'use client'

import { useCallback, useRef, useState } from 'react'

import { cn } from '../../../lib/utils'
import { Dropzone, type DropzoneProps } from '../Dropzone'
import { FormField, type FormFieldProps } from '../FormField'
import { Icon } from '../Icons'
import Text from '../Text'

type Props = Omit<DropzoneProps, 'children'> &
  Omit<FormFieldProps, 'children'> & { placeholder: string }
export function DropzoneInput({
  label,
  description,
  errors,
  errorStyle,
  placeholder,
  accept,
  multiple,
  ...rest
}: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const onClickZone = useCallback(() => {
    if (!ref.current) return

    ref.current.click()
  }, [ref])
  const onFileChange = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return

      setSelectedFile(file)
    },
    [setSelectedFile],
  )
  const name = selectedFile?.name
  return (
    <div onClick={onClickZone}>
      <FormField
        label={label}
        description={description}
        errors={errors}
        errorStyle={errorStyle}
      >
        <Dropzone
          ref={ref}
          onChange={onFileChange}
          accept={accept}
          multiple={multiple}
          {...rest}
        >
          {({ isDragging }) => (
            <div
              className={cn(
                'cursor-pointer flex min-w-0 border',
                'rounded-md p-5 gap-x-5 flex items-center justify-center',
                {
                  'border-border': !isDragging,
                  'border-dashed border-current': isDragging,
                },
              )}
            >
              <Icon
                name='fileUp'
                color='accentForeground'
                widthClass='w-6'
                heightClass='h-6'
              />
              <div className='flex-grow flex-shrink truncate'>
                {name ? (
                  <Text.H5 ellipsis noWrap color='foreground'>
                    {name}
                  </Text.H5>
                ) : (
                  <Text.H5M color='accentForeground'>{placeholder}</Text.H5M>
                )}
              </div>
            </div>
          )}
        </Dropzone>
      </FormField>
    </div>
  )
}
