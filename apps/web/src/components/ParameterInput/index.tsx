import { ChangeEvent, useCallback, useMemo } from 'react'

import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { ParameterType } from '@latitude-data/constants'
import { DropzoneInput } from '@latitude-data/web-ui/atoms/DropzoneInput'
import { isPromptLFile } from 'promptl-ai'
import useFiles from '$/stores/files'
import { SUPPORTED_IMAGE_TYPES } from '@latitude-data/core/constants'

export function ParameterInputSkeleton() {
  return (
    <Skeleton className='w-full h-[30px] rounded-md bg-muted animate-pulse' />
  )
}

export function ParameterInput({
  type,
  name,
  value,
  onChange,
  disabled = false,
  withBorder = true,
  inputSize = 'large',
}: {
  name: string
  type: ParameterType
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
  withBorder?: boolean
  inputSize?: 'small' | 'medium' | 'large'
}) {
  if (type === ParameterType.File || type === ParameterType.Image) {
    return (
      <FileParameterInput
        type={type}
        withBorder={withBorder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        inputSize={inputSize}
      />
    )
  }

  if (type === ParameterType.Text) {
    return (
      <TextParameterInput
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    )
  }

  return (
    <TextArea
      name={name}
      value='Parameter type not supported'
      minRows={1}
      maxRows={1}
      disabled={true}
    />
  )
}

function TextParameterInput({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const onTextChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
    },
    [onChange],
  )

  const textValue = useMemo(() => {
    try {
      const file = JSON.parse(value || '')
      if (file?.url) {
        return file.url
      }
    } catch {
      // Do nothing
    }

    return value
  }, [value])

  return (
    <TextArea
      name={name}
      defaultValue={textValue}
      onChange={onTextChange}
      minRows={1}
      maxRows={6}
      disabled={disabled}
    />
  )
}

function FileParameterInput({
  type,
  value,
  onChange,
  disabled = false,
  withBorder = true,
  inputSize = 'large',
}: {
  type: ParameterType.File | ParameterType.Image
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
  withBorder?: boolean
  inputSize?: 'small' | 'medium' | 'large'
}) {
  const { uploadFile, isLoading } = useFiles()
  const onFileChange = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (file) {
        const uploadedFile = await uploadFile({ file })
        if (uploadedFile) return onChange(JSON.stringify(uploadedFile))
      }

      onChange('')
    },
    [uploadFile, onChange],
  )
  const [, filename] = useMemo(() => {
    try {
      const file = JSON.parse(value || '')

      if (isPromptLFile(file)) {
        return [file.url, file.name]
      }
    } catch {
      // Do nothing
    }

    return [value, (value ?? '').split('/').at(-1)]
  }, [value])

  if (isLoading) {
    return <ParameterInputSkeleton />
  }

  const isImage = type === ParameterType.Image

  return (
    <DropzoneInput
      icon={isImage ? 'imageUp' : 'fileUp'}
      inputSize={inputSize}
      placeholder={isImage ? 'Upload image' : 'Upload file'}
      defaultFilename={filename}
      onChange={onFileChange}
      accept={isImage ? SUPPORTED_IMAGE_TYPES.join(',') : undefined}
      multiple={false}
      disabled={disabled}
      withBorder={withBorder}
    />
  )
}
