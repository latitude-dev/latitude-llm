import { type Column, getTableColumns, sql, type Table } from 'drizzle-orm'
import { timestamp } from 'drizzle-orm/pg-core'

export function timestamps() {
  return {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  }
}

type ExtractedColumnsFromTables<Tables extends Record<string, Table>> = {
  [K in keyof Tables]: Tables[K]['_']['columns']
}[keyof Tables]

/**
 * Extracts columns from multiple polymorphic relations based on the polymorphic column value
 * @param column The polymorphic column
 * @param tables A record of the polymorphic tables, where the key is the polymorphic column value
 *
 * Note: Black magic ahead.
 */
export function getSharedTableColumns<
  C extends Column,
  ColumnType extends C['_']['dataType'] | string,
  Tables extends Record<ColumnType, Table>,
>(
  column: C,
  tables: Record<ColumnType, Table>,
  aliasPrefix?: string,
): ExtractedColumnsFromTables<Tables> {
  const uniqueTablesColumns = Object.entries(tables).reduce(
    (acc, [dataType, table]) => {
      const tableColumns = getTableColumns(table as Table)

      Object.entries(tableColumns).forEach(([columnName, column]) => {
        const value = {
          [dataType as ColumnType]: column,
        } as Record<ColumnType, Column>

        acc[columnName] = {
          ...acc[columnName],
          ...value,
        }
      })

      return acc
    },
    {} as Record<string, Record<ColumnType, Column>>,
  )

  return Object.entries(uniqueTablesColumns).reduce((acc, [columnName, cases]) => {
    const columnTypes = Object.values(cases).map((c) => (c as Column).dataType)
    if (new Set(columnTypes).size > 1) {
      throw new Error(
        `Columns for ${columnName} have different data types: ${columnTypes.join(', ')}`,
      )
    }
    const columnType = Object.values(cases)[0]! as Column

    const stringCases = sql.join(
      Object.entries(cases).map(([caseValue, caseColumn]) => {
        return sql`WHEN ${column} = ${caseValue} THEN ${caseColumn}`
      }),
      sql` `,
    )

    const alias = [aliasPrefix, columnName].filter(Boolean).join('_')

    const columnSql =
      Object.values(cases).length === 1
        ? sql`${Object.values(cases)[0]}`
        : sql`CASE ${stringCases} END`

    return {
      ...acc,
      [columnName]: columnSql
        .mapWith(columnType) // Parse to the column type
        .as(alias),
    }
  }, {}) as ExtractedColumnsFromTables<Tables>
}
