import { setDOMUnmanaged } from 'lexical'
import { createRoot } from 'react-dom/client'
export const VERTICAL_SPACE_CLASS = 'space-y-2'

export interface HeaderDivWithRoot extends HTMLDivElement {
  __reactHeaderRoot__?: unknown
}

export function createReactDivWrapper({
  className,
  parentDiv,
  onRender,
}: {
  className: string
  parentDiv: HTMLElement
  onRender: (div: HeaderDivWithRoot) => void
}) {
  const div = document.createElement('div') as HeaderDivWithRoot
  div.setAttribute('spellcheck', 'false')
  div.setAttribute('contenteditable', 'false')
  div.className = className
  div.__reactHeaderRoot__ = createRoot(div)
  onRender(div)
  parentDiv.appendChild(div)
  setDOMUnmanaged(div)
}

export function replaceReactRoot({
  dom,
  className,
  onRender,
}: {
  className: string
  dom: HTMLElement
  onRender: (root: unknown) => void
}) {
  const div = dom.querySelector(`.${className}`) as HeaderDivWithRoot
  const root = div.__reactHeaderRoot__
  if (root) onRender(root)
}
