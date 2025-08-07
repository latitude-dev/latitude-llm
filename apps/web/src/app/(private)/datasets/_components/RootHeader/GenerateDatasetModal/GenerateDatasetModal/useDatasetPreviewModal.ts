import { generateDatasetPreviewAction } from '$/actions/sdk/generateDatasetPreviewAction'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { ChangeEvent, useCallback, useEffect, useState } from 'react'
import { useServerAction } from 'zsa-react'

function usePreviewData() {
  const { toast } = useToast()
  const {
    data,
    execute: runPreviewAction,
    isPending: previewIsLoading,
    error: previewError,
  } = useServerAction(generateDatasetPreviewAction, {
    onError: (error) => {
      toast({
        title: 'Failed to generate dataset',
        description: error.err.message,
        variant: 'destructive',
      })
    },
  })

  return {
    explanation: data?.explanation,
    previewData: data,
    runPreviewAction,
    previewIsLoading,
    previewError,
  }
}

export type PreviewData = ReturnType<typeof usePreviewData>['previewData']

export function useDatasetPreviewModal({
  defaultName,
  defaultParameters,
  generateErrorMessage,
}: {
  defaultName?: string
  defaultParameters: string[]
  generateErrorMessage?: string
}) {
  const preview = usePreviewData()
  const [parameters, setParameters] = useState<string[]>(defaultParameters)

  const handleParametersChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const parameterList = e.target.value
        .split(',')
        .map((param) => param.trim())
        .filter(Boolean)
      setParameters(parameterList)
    },
    [],
  )

  const generatePreview = useCallback(
    async (formData: FormData) => {
      const [data] = await preview.runPreviewAction({
        parameters: formData.get('parameters') as string,
        description: formData.get('description') as string,
      })
      if (!data) return
    },
    [preview],
  )

  const handleRegeneratePreview = useCallback(async () => {
    const form = window.document.getElementById(
      'generateDatasetForm',
    ) as HTMLFormElement
    const formData = new FormData(form)

    await preview.runPreviewAction({
      parameters: formData.get('parameters') as string,
      description: formData.get('description') as string,
    })
  }, [preview])

  // Auto run preview if default parameters are provided
  useEffect(() => {
    if (defaultName && defaultParameters.length > 0) {
      preview.runPreviewAction({
        parameters: defaultParameters.join(','),
        description: defaultName,
      })
    }
  }, [defaultName, defaultParameters, preview])

  return {
    defaultParameters,
    parameters,
    explanation: preview.explanation,
    previewData: preview.previewData,
    previewIsLoading: preview.previewIsLoading,
    errorMessage: preview.previewError?.message || generateErrorMessage,

    generatePreview,
    handleRegeneratePreview,
    handleParametersChange,
  }
}
