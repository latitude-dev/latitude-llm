// @ts-expect-error istextorbinary is not typed
import { isText } from 'istextorbinary'
import { parseOfficeAsync } from 'officeparser'
import path from 'path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
// @ts-expect-error force webpack to include the sandbox
import * as _pdfjsSandbox from 'pdfjs-dist/legacy/build/pdf.sandbox.mjs'
// @ts-expect-error force webpack to include the worker
import * as _pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { MAX_UPLOAD_SIZE_IN_MB } from '../../constants'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'

// @ts-expect-error force webpack to include the sandbox
const __pdfjsSandbox = _pdfjsSandbox
// @ts-expect-error force webpack to include the worker
const __pdfjsWorker = _pdfjsWorker

export async function convertFile(
  file: File,
): Promise<TypedResult<string, Error>> {
  const extension = path.extname(file.name).toLowerCase()

  if (file.size === 0) {
    return Result.error(new BadRequestError(`File is empty`))
  }

  if (file.size > MAX_UPLOAD_SIZE_IN_MB) {
    return Result.error(new BadRequestError(`File too large`))
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  let content = ''

  try {
    switch (extension) {
      case '.pdf':
        content = await convertPdfFile(buffer)
        break
      case '.docx':
      case '.xlsx':
      case '.pptx':
      case '.odt':
      case '.ods':
      case '.odp':
        content = await parseOfficeAsync(buffer, {
          outputErrorToConsole: false,
          newlineDelimiter: '\n',
          ignoreNotes: false,
          putNotesAtLast: false,
        })
        break
      default:
        if (!isText(file.name, buffer)) {
          return Result.error(
            new BadRequestError(`Unsupported file type: ${extension}`),
          )
        }
        content = buffer.toString()
        break
    }
  } catch (_error) {
    return Result.error(
      new UnprocessableEntityError(
        `Failed to convert ${extension} file to text`,
        {},
      ),
    )
  }

  // Replace Windows-only line breaks with normal line breaks
  content = content.replace(/\r\n/g, '\n').trim()

  return Result.ok(content)
}

// Copied from officeParser. The version of pdfjs in officeParser is too old and buggy.
// The dependency cannot be force-bumped because officeParser bundles the whole library.
// https://github.com/harshankur/officeParser/blob/c969c7ae1d4dc66c65eb2f5345b9d849fd309a09/officeParser.js#L447
async function convertPdfFile(buffer: Buffer) {
  return pdfjs
    .getDocument(new Uint8Array(buffer))
    .promise.then((document) =>
      Promise.all(
        Array.from({ length: document.numPages }, (_, index) => index + 1).map(
          (pageNr) =>
            document.getPage(pageNr).then((page) => page.getTextContent()),
        ),
      ),
    )
    .then((textContentArray) => {
      return textContentArray
        .map((textContent) => textContent.items)
        .flat()
        .filter((item) => (item as TextItem).str != '')
        .reduce(
          (a, v) => ({
            text:
              a.text +
              ((v as TextItem).transform[5] != a.transform5 ? '\n' : '') +
              (v as TextItem).str,
            transform5: (v as TextItem).transform[5],
          }),
          {
            text: '',
            transform5: undefined,
          },
        ).text
    })
}
