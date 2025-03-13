import { ChangeEvent, useCallback, useMemo } from 'react'

import useFiles from '$/stores/files'
import { SUPPORTED_IMAGE_TYPES } from '@latitude-data/core/browser'
import { DropzoneInput, Skeleton, TextArea } from '@latitude-data/web-ui'
import { ParameterType } from '@latitude-data/constants'
import { isPromptLFile } from 'promptl-ai'

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
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const { uploadFile, isLoading } = useFiles()

  const onTextChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
    },
    [onChange],
  )

  const onImageChange = useCallback(
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

  const [textValue, filename] = useMemo(() => {
    try {
      const file = JSON.parse(value)
      if (isPromptLFile(file)) {
        return [file.url, file.name]
      }
    } catch {
      // Do nothing
    }
    return [value, (value ?? '').split('/').at(-1)]
  }, [value])

  switch (type) {
    case ParameterType.Text:
      return (
        <TextArea
          value={textValue}
          onChange={onTextChange}
          minRows={1}
          maxRows={6}
          disabled={disabled}
        />
      )

    case ParameterType.Image:
      return isLoading ? (
        <ParameterInputSkeleton />
      ) : (
        <DropzoneInput
          icon='imageUp'
          inputSize='small'
          placeholder='Upload image'
          defaultFilename={filename}
          onChange={onImageChange}
          accept={SUPPORTED_IMAGE_TYPES.join(',')}
          multiple={false}
          disabled={disabled}
        />
      )

    case ParameterType.File:
      return isLoading ? (
        <ParameterInputSkeleton />
      ) : (
        <DropzoneInput
          icon='fileUp'
          inputSize='small'
          placeholder='Upload file'
          defaultFilename={filename}
          onChange={onFileChange}
          accept={undefined}
          multiple={false}
          disabled={disabled}
        />
      )

    default:
      return (
        <TextArea
          value={'Parameter type not supported'}
          minRows={1}
          maxRows={1}
          disabled={true}
        />
      )
  }
}
