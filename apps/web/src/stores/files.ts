'use client'

import { useCallback } from 'react'

import useLatitudeAction from '$/hooks/useLatitudeAction'
import { MAX_SIZE, MAX_UPLOAD_SIZE_IN_MB } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'

import { convertFileAction } from '$/actions/files/convert'
import { uploadFileAction } from '$/actions/files/upload'

export default function useFiles() {
  const { toast } = useToast()

  const { execute: executeUploadFile, isPending: isUploadingFile } =
    useLatitudeAction(uploadFileAction, {
      onSuccess: async () => {
        toast({
          title: 'Hooray! 🎉',
          description: `File uploaded successfully`,
        })
      },
      onError: async (error) => {
        toast({
          title: 'Error uploading file',
          description: error?.message,
          variant: 'destructive',
        })
      },
    })

  const { execute: executeConvertFile, isPending: isConvertingFile } =
    useLatitudeAction(convertFileAction, {
      onSuccess: async () => {
        toast({
          title: 'Hooray! 🎉',
          description: `File converted successfully`,
        })
      },
      onError: async (error) => {
        toast({
          title: 'Error converting file',
          description: error?.message,
          variant: 'destructive',
        })
      },
    })

  const uploadFile = useCallback(
    async ({ file }: { file: File }) => {
      if (file.size > MAX_UPLOAD_SIZE_IN_MB) {
        toast({
          title: 'Error uploading file',
          description: `Your file must be less than ${MAX_SIZE}MB in size. You can split it into smaller files and upload them separately.`,
          variant: 'destructive',
        })
        return
      }

      const [uploadedFile, error] = await executeUploadFile({ file })
      if (error) return

      return uploadedFile
    },
    [executeUploadFile, toast],
  )

  const convertFile = useCallback(
    async ({ file }: { file: File }) => {
      if (file.size > MAX_UPLOAD_SIZE_IN_MB) {
        toast({
          title: 'Error converting file',
          description: `Your file must be less than ${MAX_SIZE}MB in size. You can split it into smaller files and upload them separately.`,
          variant: 'destructive',
        })
        return
      }

      const [content, error] = await executeConvertFile({ file })
      if (error) return

      return content
    },
    [executeConvertFile, toast],
  )

  return {
    uploadFile,
    convertFile,
    isUploadingFile,
    isConvertingFile,
    isLoading: isUploadingFile || isConvertingFile,
  }
}
