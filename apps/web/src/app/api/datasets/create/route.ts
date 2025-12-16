import { NextRequest, NextResponse } from 'next/server'
import { createDatasetFromFile } from '@latitude-data/core/services/datasets/createFromFile'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'
import {
  DELIMITER_VALUES,
  DELIMITERS_KEYS,
  MAX_SIZE,
  MAX_UPLOAD_SIZE_IN_MB,
} from '@latitude-data/core/constants'

import { flattenErrors } from '@latitude-data/core/lib/zodUtils'

import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
const MAX_SIZE_MESSAGE = `Your dataset must be less than ${MAX_SIZE}MB in size.`

const createDatasetSchema = (workspaceId: number) =>
  z
    .object({
      name: z
        .string()
        .min(1, { error: 'Name is required' })
        .refine(
          async (name) => {
            const scope = new DatasetsRepository(workspaceId)
            const existing = await scope.findByName(name)
            return !existing.length
          },
          {
            message:
              'This name was already used, please use something different',
          },
        ),
      csvDelimiter: z
        .enum(DELIMITERS_KEYS, {
          message: 'Choose a valid delimiter option',
        })
        .nullable()
        .default('comma'),
      csvCustomDelimiter: z.string().nullable().default(''),
      dataset_file: z
        .instanceof(File)
        .refine(async (file) => {
          return file.size <= MAX_UPLOAD_SIZE_IN_MB
        }, MAX_SIZE_MESSAGE)
        .refine(
          async (file) => file.type === 'text/csv',
          'Your dataset must be a CSV file',
        ),
    })
    .refine(
      async (schema) => {
        if (schema.csvDelimiter !== 'custom') return true
        return (schema.csvCustomDelimiter?.length ?? 0) > 0
      },
      {
        message: 'Custom delimiter is required',
        path: ['csvCustomDelimiter'],
      },
    )

function formDataToObject(formData: FormData) {
  return {
    name: formData.get('name') as string,
    csvDelimiter: formData.get('csvDelimiter') as string,
    csvCustomDelimiter: formData.get('csvCustomDelimiter') as string,
    dataset_file: formData.get('dataset_file') as File,
  }
}

export const POST = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        workspace,
        user,
      }: {
        workspace: Workspace
        user: User
      },
    ) => {
      // CRITICAL: Check content length BEFORE reading the request body
      // This prevents large files from being loaded into memory
      const contentLength = request.headers.get('content-length')
      if (!contentLength) {
        return NextResponse.json(
          {
            success: false,
            errors: { dataset_file: ['Content-Length header is required'] },
          },
          { status: 400 },
        )
      }

      const fileSize = parseInt(contentLength)
      if (fileSize > MAX_UPLOAD_SIZE_IN_MB) {
        return NextResponse.json(
          {
            success: false,
            errors: {
              dataset_file: [MAX_SIZE_MESSAGE],
            },
          },
          { status: 413 },
        )
      }

      // Only now we read the formData, knowing it's within limits
      const formData = await request.formData()
      const data = formDataToObject(formData)

      const schema = createDatasetSchema(workspace.id)
      const validation = await schema.safeParseAsync(data)

      if (!validation.success) {
        return NextResponse.json(
          {
            success: false,
            errors: flattenErrors(validation),
          },
          { status: 400 },
        )
      }

      const { name, csvDelimiter, csvCustomDelimiter, dataset_file } =
        validation.data

      const delimiter =
        csvDelimiter === 'custom'
          ? csvCustomDelimiter
          : DELIMITER_VALUES[csvDelimiter as keyof typeof DELIMITER_VALUES]

      const result = await createDatasetFromFile({
        workspace,
        author: user,
        data: {
          name,
          file: dataset_file,
          csvDelimiter: delimiter ?? '',
        },
      }).then((r) => r.unwrap())

      return NextResponse.json({ success: true, dataset: result.dataset })
    },
  ),
)
