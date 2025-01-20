export type TextEditorProps = {
  value?: string
  onChange: (value: string | undefined) => void
  onCmdEnter?: (value?: string | undefined) => void
  placeholder: string
}
