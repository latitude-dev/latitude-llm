'use client'

import { useCallback, useMemo } from 'react'

import { assignDatasetAction } from '$/actions/documents/assignDatasetAction'
import { createDocumentVersionAction } from '$/actions/documents/create'
import { destroyDocumentAction } from '$/actions/documents/destroyDocumentAction'
import { destroyFolderAction } from '$/actions/documents/destroyFolderAction'
import { renameDocumentPathsAction } from '$/actions/documents/renamePathsAction'
import { saveLinkedDatasetAction } from '$/actions/documents/saveLinkedDatasetAction'
import { updateDocumentContentAction } from '$/actions/documents/updateContent'
import { uploadDocumentAction } from '$/actions/documents/upload'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useEvents } from '$/lib/events'
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
import { inferServerActionReturnData } from 'zsa'
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
    async ({
      path,
      agent,
      content,
    }: {
      path: string
      agent?: boolean
      content?: string
    }) => {
      if (!projectId) return

      const [document, error] = await executeCreateDocument({
        projectId,
        commitUuid,
        path,
        agent,
        content,
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
    [executeCreateDocument, mutate, data, commitUuid, projectId, toast, router],
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
    [executeUploadDocument, mutate, data, commitUuid, projectId, toast, router],
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
    [executeRenamePaths, mutate, data, commitUuid, projectId, toast],
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
    [
      executeDestroyDocument,
      mutate,
      data,
      commitUuid,
      projectId,
      router,
      toast,
    ],
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
    [executeDestroyFolder, mutate, commitUuid, projectId, router, toast],
  )

  const { execute: updateContent, isPending: isUpdatingContent } =
    useLatitudeAction(updateDocumentContentAction, {
      onSuccess: useCallback(
        ({
          data: document,
        }: {
          data: inferServerActionReturnData<typeof updateDocumentContentAction>
        }) => {
          if (!document) return

          const prevDocuments = data || []

          mutate(
            prevDocuments.map((d) =>
              d.documentUuid === document.documentUuid ? document : d,
            ),
          )
        },
        [data, mutate],
      ),
    })

  const { execute: assignDataset, isPending: isAssigningDataset } =
    useLatitudeAction(assignDatasetAction, {
      onSuccess: useCallback(
        ({
          data: document,
        }: {
          data: inferServerActionReturnData<typeof assignDatasetAction>
        }) => {
          if (!document) return

          const prevDocuments = data || []
          mutate(
            prevDocuments.map((d) =>
              d.documentUuid === document.documentUuid ? document : d,
            ),
          )
        },
        [data, mutate],
      ),
    })

  const { execute: saveLinkedDataset, isPending: isLinkingDataset } =
    useLatitudeAction(saveLinkedDatasetAction, {
      onSuccess: useCallback(
        ({
          data: document,
        }: {
          data: inferServerActionReturnData<typeof saveLinkedDatasetAction>
        }) => {
          if (!document) return

          const prevDocuments = data || []
          mutate(
            prevDocuments.map((d) =>
              d.documentUuid === document.documentUuid ? document : d,
            ),
          )
        },
        [data, mutate],
      ),
    })

  useEvents({
    onLatteProjectChanges: ({ changes }) => {
      const commitChanges = changes.filter((c) => c.draftUuid === commitUuid)
      if (commitChanges.length === 0) return

      mutate((prev) => {
        if (!prev) return prev

        changes.forEach((change) => {
          if (change.previous) {
            const index = prev.findIndex(
              (d) => d.documentUuid === change.previous!.documentUuid,
            )
            if (index === -1) return

            if (change.current.deletedAt) {
              prev.splice(index, 1)
            }

            prev[index] = change.current as DocumentVersion
          } else {
            prev.push(change.current as DocumentVersion)
          }
        })
      })
    },
  })

  return useMemo(
    () => ({
      data,
      isValidating: isValidating,
      isLoading: isLoading,
      error: swrError,
      createFile,
      uploadFile,
      renamePaths,
      destroyFile,
      destroyFolder,
      updateContent,
      isUpdatingContent,
      assignDataset,
      saveLinkedDataset,
      mutate,
      isAssigning: isAssigningDataset || isLinkingDataset,
      isDestroying: isDestroyingFile || isDestroyingFolder,
    }),
    [
      data,
      isValidating,
      isLoading,
      swrError,
      createFile,
      uploadFile,
      renamePaths,
      destroyFile,
      destroyFolder,
      updateContent,
      isUpdatingContent,
      assignDataset,
      saveLinkedDataset,
      mutate,
      isAssigningDataset,
      isLinkingDataset,
      isDestroyingFile,
      isDestroyingFolder,
    ],
  )
}
