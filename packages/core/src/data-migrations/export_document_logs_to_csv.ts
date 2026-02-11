import { database } from '../client'
import { documentLogs } from '../schema/legacyModels/documentLogs'
import { providerLogs } from '../schema/legacyModels/providerLogs'
import { and, eq, lt, desc, sql } from 'drizzle-orm'
import { createWriteStream } from 'fs'
// @ts-expect-error - No types for fast-csv
import { format } from 'fast-csv'

const BATCH_SIZE = 1000
const TARGET_DOCUMENT_UUID = 'REDACTED' // Replace with the desired document UUID
const TARGET_COMMIT_ID = 1 // Replace with the desired commit ID
const TARGET_DATE = new Date() // Replace with the desired date range

async function exportDocumentLogsToCsv() {
  console.log('Starting document logs export to CSV...')

  // Create write stream for CSV file
  const writeStream = createWriteStream('document_logs_export.csv')
  const csvStream = format({ headers: true })

  let lastCreatedAt: Date | null = null
  let totalExported = 0

  try {
    while (true) {
      // Build the query with cursor-based pagination
      const results = await database
        .select({
          name: sql<string>`${documentLogs.parameters}->>'name'`,
          ImageUrl: sql<string>`${documentLogs.parameters}->>'ImageUrl'`,
          description: sql<string>`${documentLogs.parameters}->>'description'`,
          output: providerLogs.responseText,
          tokens: providerLogs.tokens,
          createdAt: documentLogs.createdAt,
        })
        .from(documentLogs)
        .innerJoin(
          providerLogs,
          eq(providerLogs.documentLogUuid, documentLogs.uuid),
        )
        .where(
          and(
            eq(documentLogs.documentUuid, TARGET_DOCUMENT_UUID),
            eq(documentLogs.commitId, TARGET_COMMIT_ID),
            sql`${documentLogs.createdAt} >= ${TARGET_DATE}`,
            lastCreatedAt
              ? lt(documentLogs.createdAt, lastCreatedAt)
              : undefined,
          ),
        )
        .orderBy(desc(documentLogs.createdAt))
        .limit(BATCH_SIZE)

      if (results.length === 0) break

      // Write the batch to CSV
      for (const row of results) {
        const csvRow = {
          name: row.name || '',
          ImageUrl: row.ImageUrl || '',
          description: row.description || '',
          output: row.output || '',
          tokens: row.tokens || '',
        }
        csvStream.write(csvRow)
      }

      // Update cursor
      lastCreatedAt = results[results.length - 1]!.createdAt
      totalExported += results.length

      console.log(`Exported ${totalExported} records...`)

      if (results.length < BATCH_SIZE) {
        break
      }
    }

    // End the CSV stream
    csvStream.end()

    // Wait for the pipeline to complete
    await new Promise<void>((resolve, reject) => {
      csvStream
        .pipe(writeStream)
        .on('finish', () => resolve())
        .on('error', reject)
    })

    console.log(`✅ Export completed. Total records exported: ${totalExported}`)
  } catch (error) {
    console.error('❌ Export failed:', error)
    throw error
  }
}

// Execute the export
exportDocumentLogsToCsv().catch(console.error)
