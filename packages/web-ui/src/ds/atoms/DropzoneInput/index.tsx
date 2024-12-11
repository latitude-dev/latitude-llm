'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '../../../lib/utils'
import { Button } from '../Button'
import { Dropzone, type DropzoneProps } from '../Dropzone'
import { FormField, type FormFieldProps } from '../FormField'
import { Icon, IconName } from '../Icons'
import Text from '../Text'

type Props = Omit<DropzoneProps, 'children'> &
  Omit<FormFieldProps, 'children'> & {
    defaultFilename?: string
    placeholder: string
    icon?: IconName
    inputSize?: 'small' | 'normal'
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
  inputSize = 'normal',
  onChange,
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
      setFilename(file.name)
      onChange?.(files)
    },
    [setFilename, onChange],
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
                'cursor-pointer flex min-w-0 border',
                'rounded-md gap-x-2 flex items-center justify-center',
                {
                  'border-input': !isDragging,
                  'border-dashed border-current': isDragging,
                  'p-5': inputSize === 'normal',
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
                        name: 'x',
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
