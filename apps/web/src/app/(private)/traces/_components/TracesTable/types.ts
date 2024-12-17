export type Operator = {
  label: string
  value: string
}

export type SearchColumn = {
  label: string
  field: string
  operators: Operator[]
}

export type ActiveSearch = {
  column?: SearchColumn
  operator?: Operator
}

export type CompletedSearch = {
  column: SearchColumn
  operator: Operator
  value: string
}
