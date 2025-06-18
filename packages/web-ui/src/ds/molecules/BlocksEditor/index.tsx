import { useEditor, EditorContent } from '@tiptap/react'

const content = '<p>Hello World!</p>'

const Tiptap = () => {
  const editor = useEditor({
    extensions: [],
    content,
  })

  return <EditorContent editor={editor} content={content} />
}

export default Tiptap
