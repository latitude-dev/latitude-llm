export type EditorCellProps = {
  value: string | undefined
  valueType: 'text' | 'json'
  onChange: (args: { value: string; commitChanges: boolean }) => void
}
