'use client'

import { createDocumentVersionAction } from '$/actions/documents/create'
import { destroyDocumentAction } from '$/actions/documents/destroyDocumentAction'
import { destroyFolderAction } from '$/actions/documents/destroyFolderAction'
import { renameDocumentPathsAction } from '$/actions/documents/renamePathsAction'
import { updateDocumentContentAction } from '$/actions/documents/updateContent'
import { uploadDocumentAction } from '$/actions/documents/upload'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import {
  DocumentVersionDto,
  HEAD_COMMIT,
  MAX_SIZE,
  MAX_UPLOAD_SIZE_IN_MB,
} from '@latitude-data/core/constants'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { useSWRConfig } from 'swr'
import { getDocumentVersionsCacheKey } from '../documentVersions'
import { getDocumentVersionCacheKey } from '../useDocumentVersion'

/**
 * Document CRUD actions
 */
export function useDocumentVersionActions(
  {
    commitUuid = HEAD_COMMIT,
    projectId,
  }: { commitUuid?: string; projectId?: number } = { commitUuid: HEAD_COMMIT },
) {
  const { toast } = useToast()
  const router = useRouter()
  const { mutate: globalMutate } = useSWRConfig()
  const documentVersionsCache = useMemo(
    () =>
      projectId
        ? getDocumentVersionsCacheKey({ projectId, commitUuid })
        : undefined,
    [projectId, commitUuid],
  )
  const showActionError = useCallback(
    (title: string, error: { formErrors?: string[]; message: string }) => {
      toast({
        title,
        description: error.formErrors?.[0] || error.message,
        variant: 'destructive',
      })
    },
    [toast],
  )
  const getDocumentCacheKey = useCallback(
    ({
      scopedProjectId,
      documentUuid,
    }: {
      scopedProjectId: number
      documentUuid: string
    }) =>
      getDocumentVersionCacheKey({
        projectId: scopedProjectId,
        commitUuid,
        documentUuid,
      }),
    [commitUuid],
  )
  const toDocumentVersionDto = useCallback(
    ({
      document,
      scopedProjectId,
    }: {
      document: DocumentVersion | DocumentVersionDto
      scopedProjectId: number
    }): DocumentVersionDto => ({
      ...document,
      projectId: scopedProjectId,
      commitUuid,
    }),
    [commitUuid],
  )
  const appendDocumentToListCache = useCallback(
    (document: DocumentVersion) => {
      if (!documentVersionsCache) return

      globalMutate(
        documentVersionsCache,
        (prev: DocumentVersion[] | undefined) => [...(prev || []), document],
        { revalidate: false },
      )
    },
    [documentVersionsCache, globalMutate],
  )
  const updateDocumentInListCache = useCallback(
    (document: DocumentVersion | DocumentVersionDto) => {
      if (!documentVersionsCache) return

      globalMutate(
        documentVersionsCache,
        (prev: DocumentVersion[] | undefined) =>
          (prev || []).map((doc) =>
            doc.documentUuid === document.documentUuid
              ? { ...doc, ...document }
              : doc,
          ),
        { revalidate: false },
      )
    },
    [documentVersionsCache, globalMutate],
  )
  const updateManyDocumentsInListCache = useCallback(
    (updatedDocuments: DocumentVersion[]) => {
      if (!documentVersionsCache) return

      globalMutate(
        documentVersionsCache,
        (prev: DocumentVersion[] | undefined) =>
          (prev || []).map((doc) => {
            const updated = updatedDocuments.find(
              (updatedDoc) => updatedDoc.documentUuid === doc.documentUuid,
            )
            return updated || doc
          }),
        { revalidate: false },
      )
    },
    [documentVersionsCache, globalMutate],
  )
  const removeDocumentFromListCache = useCallback(
    (documentUuid: string) => {
      if (!documentVersionsCache) return

      globalMutate(
        documentVersionsCache,
        (prev: DocumentVersion[] | undefined) =>
          (prev || []).filter((doc) => doc.documentUuid !== documentUuid),
        { revalidate: false },
      )
    },
    [documentVersionsCache, globalMutate],
  )
  const setDocumentCache = useCallback(
    ({
      document,
      scopedProjectId,
    }: {
      document: DocumentVersion | DocumentVersionDto
      scopedProjectId: number
    }) => {
      globalMutate(
        getDocumentCacheKey({
          scopedProjectId,
          documentUuid: document.documentUuid,
        }),
        toDocumentVersionDto({ document, scopedProjectId }),
        { revalidate: false },
      )
    },
    [globalMutate, getDocumentCacheKey, toDocumentVersionDto],
  )
  const mergeDocumentCache = useCallback(
    ({
      document,
      scopedProjectId,
    }: {
      document: DocumentVersion | DocumentVersionDto
      scopedProjectId: number
    }) => {
      const nextDocument = toDocumentVersionDto({ document, scopedProjectId })

      globalMutate(
        getDocumentCacheKey({
          scopedProjectId,
          documentUuid: document.documentUuid,
        }),
        (prev: DocumentVersionDto | undefined) => ({
          ...(prev || nextDocument),
          ...nextDocument,
        }),
        { revalidate: false },
      )
    },
    [globalMutate, getDocumentCacheKey, toDocumentVersionDto],
  )
  const clearDocumentCache = useCallback(
    ({
      documentUuid,
      scopedProjectId,
    }: {
      documentUuid: string
      scopedProjectId: number
    }) => {
      globalMutate(
        getDocumentCacheKey({ scopedProjectId, documentUuid }),
        undefined,
        {
          revalidate: false,
        },
      )
    },
    [globalMutate, getDocumentCacheKey],
  )

  const { execute: executeCreateDocument, isPending: isCreating } =
    useLatitudeAction(createDocumentVersionAction, {
      onSuccess: ({ data: document }) => {
        if (!projectId || !document) return

        appendDocumentToListCache(document)
        setDocumentCache({ document, scopedProjectId: projectId })
        router.push(
          ROUTES.projects
            .detail({ id: projectId })
            .commits.detail({ uuid: commitUuid })
            .documents.detail({ uuid: document.documentUuid }).root,
        )
      },
      onError: (error) => showActionError('Error creating document', error),
    })
  const { execute: executeUploadDocument, isPending: isUploading } =
    useLatitudeAction(uploadDocumentAction, {
      onSuccess: ({ data: document }) => {
        if (!projectId || !document) return

        appendDocumentToListCache(document)
        setDocumentCache({ document, scopedProjectId: projectId })
        router.push(
          ROUTES.projects
            .detail({ id: projectId })
            .commits.detail({ uuid: commitUuid })
            .documents.detail({ uuid: document.documentUuid }).root,
        )
      },
      onError: (error) => showActionError('Error uploading document', error),
    })
  const { execute: executeRenamePaths, isPending: isRenaming } =
    useLatitudeAction(renameDocumentPathsAction, {
      onSuccess: ({ data: updatedDocuments }) => {
        if (!projectId || !updatedDocuments) return

        updateManyDocumentsInListCache(updatedDocuments)
        updatedDocuments.forEach((updatedDocument) => {
          mergeDocumentCache({
            document: updatedDocument,
            scopedProjectId: projectId,
          })
        })
      },
      onError: (error) => showActionError('Error renaming paths', error),
    })
  const { execute: executeUpdateContent, isPending: isUpdatingContent } =
    useLatitudeAction(updateDocumentContentAction, {
      onSuccess: ({ data: document }) => {
        if (!projectId || !document) return

        updateDocumentInListCache(document)
        mergeDocumentCache({ document, scopedProjectId: projectId })
      },
      onError: (error) => showActionError('Error updating document', error),
    })
  const { execute: executeDestroyDocument, isPending: isDestroyingFile } =
    useLatitudeAction(destroyDocumentAction, {
      onError: (error) => showActionError('Error deleting document', error),
    })
  const { execute: executeDestroyFolder, isPending: isDestroyingFolder } =
    useLatitudeAction(destroyFolderAction, {
      onSuccess: async () => {
        if (!projectId) return

        toast({
          title: 'Success',
          description: 'Folder deleted',
        })
        if (documentVersionsCache) {
          await globalMutate(documentVersionsCache)
        }
        router.push(
          ROUTES.projects
            .detail({ id: projectId })
            .commits.detail({ uuid: commitUuid }).documents.root,
        )
      },
      onError: (error) => showActionError('Error deleting folder', error),
    })

  const createFile = useCallback(
    async ({
      path,
      agent,
      content,
      onSuccess,
    }: {
      path: string
      agent?: boolean
      content?: string
      onSuccess?: (document: DocumentVersion) => void
    }) => {
      if (!projectId) return undefined
      const [document, error] = await executeCreateDocument({
        projectId,
        commitUuid,
        path,
        agent,
        content,
      })

      if (error || !document) return undefined
      onSuccess?.(document)

      return document
    },
    [executeCreateDocument, commitUuid, projectId],
  )

  const uploadFile = useCallback(
    async ({
      path,
      file,
      onSuccess,
    }: {
      path: string
      file: File
      onSuccess?: (document: DocumentVersion) => void
    }) => {
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

      if (error || !document) return
      onSuccess?.(document)
    },
    [executeUploadDocument, commitUuid, projectId, toast],
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

      if (error || !updatedDocuments) return
      return updatedDocuments
    },
    [executeRenamePaths, commitUuid, projectId],
  )

  const updateContent = useCallback(
    async ({
      documentUuid,
      content,
    }: {
      documentUuid: string
      content: string
    }) => {
      if (!projectId) return undefined
      const [document, error] = await executeUpdateContent({
        projectId,
        commitUuid,
        documentUuid,
        content,
      })

      if (error || !document) return undefined

      return document
    },
    [executeUpdateContent, projectId, commitUuid],
  )

  const destroyFile = useCallback(
    async (
      documentUuid: string,
      opts?: {
        onSuccess?: () => void
      },
    ) => {
      if (!projectId) return
      const [_, error] = await executeDestroyDocument({
        documentUuid,
        projectId,
        commitUuid,
      })

      if (error) return
      toast({
        title: 'Success',
        description: 'Document deleted',
      })
      removeDocumentFromListCache(documentUuid)
      clearDocumentCache({ documentUuid, scopedProjectId: projectId })
      opts?.onSuccess?.()
    },
    [
      executeDestroyDocument,
      projectId,
      commitUuid,
      toast,
      removeDocumentFromListCache,
      clearDocumentCache,
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

      if (error) return
    },
    [executeDestroyFolder, commitUuid, projectId],
  )

  return useMemo(
    () => ({
      createFile,
      uploadFile,
      renamePaths,
      updateContent,
      destroyFile,
      destroyFolder,
      isLoading:
        isCreating ||
        isUploading ||
        isRenaming ||
        isUpdatingContent ||
        isDestroyingFile ||
        isDestroyingFolder,
      isDestroying: isDestroyingFile || isDestroyingFolder,
      isUpdatingContent,
    }),
    [
      createFile,
      uploadFile,
      renamePaths,
      updateContent,
      destroyFile,
      destroyFolder,
      isCreating,
      isUploading,
      isRenaming,
      isUpdatingContent,
      isDestroyingFile,
      isDestroyingFolder,
    ],
  )
}
