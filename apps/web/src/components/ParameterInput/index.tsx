import { ChangeEvent, useCallback, useMemo } from 'react'

import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { ParameterType } from '@latitude-data/constants'
import { DropzoneInput } from '@latitude-data/web-ui/atoms/DropzoneInput'
import { SUPPORTED_IMAGE_TYPES } from '@latitude-data/core/browser'
import { isPromptLFile } from 'promptl-ai'
import useFiles from '$/stores/files'

export function ParameterInputSkeleton() {
  return (
    <Skeleton className='w-full h-[30px] rounded-md bg-muted animate-pulse' />
  )
}

export function ParameterInput({
  type,
  value,
  onChange,
  disabled = false,
}: {
  type: ParameterType
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  if (type === ParameterType.File || type === ParameterType.Image) {
    return (
      <FileParameterInput
        type={type}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    )
  }

  if (type === ParameterType.Text) {
    return (
      <TextParameterInput
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    )
  }

  return (
    <TextArea
      value='Parameter type not supported'
      minRows={1}
      maxRows={1}
      disabled={true}
    />
  )
}

function TextParameterInput({
  value,
  onChange,
  disabled = false,
}: {
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
}: {
  type: ParameterType.File | ParameterType.Image
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
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
      inputSize='small'
      placeholder={isImage ? 'Upload image' : 'Upload file'}
      defaultFilename={filename}
      onChange={onFileChange}
      accept={isImage ? SUPPORTED_IMAGE_TYPES.join(',') : undefined}
      multiple={false}
      disabled={disabled}
    />
  )
}
