'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '../../../lib/utils'
import { Button } from '../Button'
import { Dropzone } from '../Dropzone'
import { type DropzoneProps } from '../Dropzone'
import { FormField } from '../FormField'
import { type FormFieldProps } from '../FormField'
import { Icon, IconName } from '../Icons'
import { Text } from '../Text'

type OnFileSizeErrorArgs = {
  name: string
  sizeInMB: string
  maxSizeInMB: string
}

type Props = Omit<DropzoneProps, 'children'> &
  Omit<FormFieldProps, 'children'> & {
    defaultFilename?: string
    placeholder: string
    icon?: IconName
    inputSize?: 'small' | 'medium' | 'large'
    maxFileSize?: number
    withBorder?: boolean
    onFileSizeError?: (_args: OnFileSizeErrorArgs) => void
    onChange?: (files: FileList | null) => void
  }

export function DropzoneInput({
  label,
  description,
  errors,
  errorStyle,
  placeholder,
  accept,
  multiple,
  defaultFilename,
  icon = 'fileUp',
  inputSize = 'large',
  maxFileSize,
  onFileSizeError,
  onChange,
  withBorder = true,
  ...rest
}: Props) {
  const [filename, setFilename] = useState<string | undefined>(defaultFilename)
  useEffect(() => setFilename(defaultFilename), [defaultFilename])

  const ref = useRef<HTMLInputElement>(null)

  const onClickZone = useCallback(() => {
    if (!ref.current) return
    ref.current.click()
  }, [ref])

  const onFileChange = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return

      if (maxFileSize && file.size > maxFileSize) {
        if (ref.current) ref.current.value = ''
        onFileSizeError?.({
          name: file.name,
          sizeInMB: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
          maxSizeInMB: `${(maxFileSize / 1024 / 1024).toFixed(2)}MB`,
        })
        return
      }

      setFilename(file.name)
      onChange?.(files)
    },
    [setFilename, onChange, maxFileSize, onFileSizeError],
  )

  const onClearFile = useCallback(() => {
    if (ref.current) ref.current.value = ''
    setFilename(undefined)
    onChange?.(null)
  }, [ref, setFilename, onChange])

  return (
    <div onClick={onClickZone} className='w-full'>
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
                'cursor-pointer flex min-w-0',
                'gap-x-2 flex items-center justify-center',
                {
                  'border rounded-md': withBorder,
                  'border-input': !isDragging && withBorder,
                  'border-dashed border-current': isDragging && withBorder,
                  'p-5': inputSize === 'large',
                  'p-3': inputSize === 'medium',
                  'px-2 py-1': inputSize === 'small',
                },
              )}
            >
              <Icon
                name={icon}
                color='accentForeground'
                widthClass='w-6'
                heightClass='h-6'
                className='shrink-0'
              />
              <div className='flex-grow flex-shrink truncate flex items-center justify-between gap-x-2'>
                {filename ? (
                  <>
                    <Text.H5 ellipsis noWrap color='foreground'>
                      {filename}
                    </Text.H5>
                    <Button
                      variant='ghost'
                      size='none'
                      iconProps={{
                        name: 'close',
                        color: 'foregroundMuted',
                        size: 'normal',
                        className: 'shrink-0',
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onClearFile()
                      }}
                    />
                  </>
                ) : (
                  <Text.H5M ellipsis noWrap color='accentForeground'>
                    {placeholder}
                  </Text.H5M>
                )}
              </div>
            </div>
          )}
        </Dropzone>
      </FormField>
    </div>
  )
}
