'use client'

import { useCallback } from 'react'

import useFetcher from '$/hooks/useFetcher'
import { assignDatasetAction } from '$/actions/documents/assignDatasetAction'
import { saveLinkedDatasetAction } from '$/actions/documents/saveLinkedDatasetAction'
import { createDocumentVersionAction } from '$/actions/documents/create'
import { createDocumentVersionFromTraceAction } from '$/actions/documents/createFromTrace'
import { destroyDocumentAction } from '$/actions/documents/destroyDocumentAction'
import { destroyFolderAction } from '$/actions/documents/destroyFolderAction'
import { renameDocumentPathsAction } from '$/actions/documents/renamePathsAction'
import { updateDocumentContentAction } from '$/actions/documents/updateContent'
import { uploadDocumentAction } from '$/actions/documents/upload'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import {
  HEAD_COMMIT,
  MAX_SIZE,
  MAX_UPLOAD_SIZE_IN_MB,
  type DocumentVersion,
} from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useRouter } from 'next/navigation'
import useSWR, { SWRConfiguration } from 'swr'
import { useServerAction } from 'zsa-react'

const EMPTY_DATA = [] as DocumentVersion[]
export default function useDocumentVersions(
  {
    commitUuid = HEAD_COMMIT,
    projectId,
  }: { commitUuid?: string; projectId?: number } = { commitUuid: HEAD_COMMIT },
  opts: SWRConfiguration & {
    onSuccessCreate?: (document: DocumentVersion) => void
  } = {},
) {
  const { toast } = useToast()
  const { onSuccessCreate } = opts
  const enabled = !!projectId && !!commitUuid
  const fetcher = useFetcher<DocumentVersion[]>(
    enabled
      ? ROUTES.api.projects.detail(projectId).commits.detail(commitUuid).root
      : undefined,
    {
      fallback: EMPTY_DATA,
    },
  )
  const {
    mutate,
    data = EMPTY_DATA,
    isValidating,
    isLoading,
    error: swrError,
  } = useSWR<DocumentVersion[]>(
    enabled ? ['documentVersions', projectId, commitUuid] : undefined,
    fetcher,
    opts,
  )

  const router = useRouter()
  const { execute: executeCreateDocument } = useServerAction(
    createDocumentVersionAction,
    {
      onSuccess: ({ data: document }) => {
        onSuccessCreate?.(document)
      },
    },
  )
  const { execute: executeUploadDocument } = useServerAction(
    uploadDocumentAction,
    {
      onSuccess: ({ data: document }) => {
        onSuccessCreate?.(document)
      },
    },
  )
  const { execute: executeRenamePaths } = useServerAction(
    renameDocumentPathsAction,
  )
  const { execute: executeDestroyDocument, isPending: isDestroyingFile } =
    useServerAction(destroyDocumentAction)
  const { execute: executeDestroyFolder, isPending: isDestroyingFolder } =
    useServerAction(destroyFolderAction)

  const createFile = useCallback(
    async ({ path }: { path: string }) => {
      if (!projectId) return

      const [document, error] = await executeCreateDocument({
        path,
        projectId,
        commitUuid,
      })

      if (error) {
        toast({
          title: 'Error creating document',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
      } else if (document) {
        const prevDocuments = data || []

        if (document) {
          mutate([...prevDocuments, document])
          router.push(
            ROUTES.projects
              .detail({ id: projectId! })
              .commits.detail({ uuid: commitUuid })
              .documents.detail({ uuid: document.documentUuid }).root,
          )
        }
      }
    },
    [executeCreateDocument, mutate, data, commitUuid],
  )

  const uploadFile = useCallback(
    async ({ path, file }: { path: string; file: File }) => {
      if (!projectId) return

      if (file.size > MAX_UPLOAD_SIZE_IN_MB) {
        toast({
          title: 'Error uploading document',
          description: `Your file must be less than ${MAX_SIZE}MB in size. You can split it into smaller files and upload them separately.`,
          variant: 'destructive',
        })
        return
      }

      const [document, error] = await executeUploadDocument({
        path,
        projectId,
        commitUuid,
        file,
      })

      if (error) {
        toast({
          title: 'Error uploading document',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
        return
      }

      if (!document) return

      const prevDocuments = data || []
      mutate([...prevDocuments, document])
      router.push(
        ROUTES.projects
          .detail({ id: projectId! })
          .commits.detail({ uuid: commitUuid })
          .documents.detail({ uuid: document.documentUuid }).root,
      )
    },
    [executeUploadDocument, mutate, data, commitUuid],
  )

  const renamePaths = useCallback(
    async ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
      if (!projectId) return

      const [updatedDocuments, error] = await executeRenamePaths({
        oldPath,
        newPath,
        projectId,
        commitUuid,
      })

      if (updatedDocuments) {
        mutate(
          data.map((d) => {
            const updatedDocument = updatedDocuments.find(
              (ud) => ud.documentUuid === d.documentUuid,
            )
            return updatedDocument ? updatedDocument : d
          }),
        )
      }

      if (error) {
        toast({
          title: 'Error renaming paths',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
      }
    },
    [executeRenamePaths, mutate, data, commitUuid],
  )

  const destroyFile = useCallback(
    async (documentUuid: string) => {
      if (!projectId) return

      const [_, error] = await executeDestroyDocument({
        documentUuid,
        projectId,
        commitUuid,
      })
      if (error) {
        toast({
          title: 'Error deleting document',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
      } else {
        const prevDocuments = data || []
        mutate(prevDocuments.filter((d) => d.documentUuid !== documentUuid))
        toast({
          title: 'Success',
          description: 'Document deleted',
        })
        router.push(
          ROUTES.projects
            .detail({ id: projectId })
            .commits.detail({ uuid: commitUuid }).documents.root,
        )
      }
    },
    [executeDestroyDocument, mutate, data, commitUuid],
  )

  const destroyFolder = useCallback(
    async (path: string) => {
      if (!projectId) return

      const [_, error] = await executeDestroyFolder({
        projectId,
        commitUuid,
        path,
      })

      if (error) {
        toast({
          title: 'Error deleting folder',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
      } else {
        await mutate()

        toast({
          title: 'Success',
          description: 'Folder deleted',
        })
        router.push(
          ROUTES.projects
            .detail({ id: projectId })
            .commits.detail({ uuid: commitUuid }).documents.root,
        )
      }
    },
    [executeDestroyFolder, mutate, commitUuid],
  )

  const { execute: updateContent } = useLatitudeAction(
    updateDocumentContentAction,
    {
      onSuccess: ({ data: document }) => {
        if (!document) return

        const prevDocuments = data || []

        mutate(
          prevDocuments.map((d) =>
            d.documentUuid === document.documentUuid ? document : d,
          ),
        )
      },
    },
  )

  const { execute: assignDataset, isPending: isAssigningDataset } =
    useLatitudeAction(assignDatasetAction, {
      onSuccess: ({ data: document }) => {
        if (!document) return

        const prevDocuments = data || []
        mutate(
          prevDocuments.map((d) =>
            d.documentUuid === document.documentUuid ? document : d,
          ),
        )
      },
    })

  const { execute: saveLinkedDataset, isPending: isLinkingDataset } =
    useLatitudeAction(saveLinkedDatasetAction, {
      onSuccess: ({ data: document }) => {
        if (!document) return

        const prevDocuments = data || []
        mutate(
          prevDocuments.map((d) =>
            d.documentUuid === document.documentUuid ? document : d,
          ),
        )
      },
    })

  const { execute: createFromTrace } = useLatitudeAction(
    createDocumentVersionFromTraceAction,
    {
      onSuccess: ({ data: documentVersion }) => {
        toast({
          title: 'Success',
          description: 'Document successfully created',
        })
        mutate([...data, documentVersion])
      },
      onError: (error) => {
        toast({
          title: 'Error creating document',
          description: error.err.formErrors?.[0] || error.err.message,
          variant: 'destructive',
        })
      },
    },
  )

  return {
    data,
    isValidating: isValidating,
    isLoading: isLoading,
    error: swrError,
    createFile,
    uploadFile,
    createFromTrace,
    renamePaths,
    destroyFile,
    destroyFolder,
    updateContent,
    assignDataset,
    saveLinkedDataset,
    mutate,
    isAssigning: isAssigningDataset || isLinkingDataset,
    isDestroying: isDestroyingFile || isDestroyingFolder,
  }
}
