const TARGET_LINE_HALF_HEIGHT = 2
const TEXT_BOX_HORIZONTAL_PADDING = 16

export function getCollapsedMargins(elem: HTMLElement): {
  marginTop: number
  marginBottom: number
} {
  const getMargin = (element: Element | null, margin: 'marginTop' | 'marginBottom'): number =>
    element ? parseFloat(window.getComputedStyle(element)[margin]) : 0

  const { marginTop, marginBottom } = window.getComputedStyle(elem)
  const prevElemSiblingMarginBottom = getMargin(elem.previousElementSibling, 'marginBottom')
  const nextElemSiblingMarginTop = getMargin(elem.nextElementSibling, 'marginTop')
  const collapsedTopMargin = Math.max(parseFloat(marginTop), prevElemSiblingMarginBottom)
  const collapsedBottomMargin = Math.max(parseFloat(marginBottom), nextElemSiblingMarginTop)

  return { marginBottom: collapsedBottomMargin, marginTop: collapsedTopMargin }
}

function calculateLineDimensions(targetBlockElem: HTMLElement, anchorRect: DOMRect) {
  const targetRect = targetBlockElem.getBoundingClientRect()
  const contentArea = targetBlockElem.querySelector('[data-content-area]') as HTMLElement

  if (contentArea) {
    const contentRect = contentArea.getBoundingClientRect()
    return {
      lineLeft: contentRect.left - anchorRect.left,
      lineWidth: contentRect.width,
    }
  }

  return {
    lineLeft: targetRect.left - anchorRect.left + TEXT_BOX_HORIZONTAL_PADDING,
    lineWidth: targetRect.width - TEXT_BOX_HORIZONTAL_PADDING * 2,
  }
}

function calculateSpacing(
  targetBlockElem: HTMLElement,
  dropMode: 'inside' | 'before' | 'after',
): number {
  if (dropMode === 'inside') return 0

  const { marginTop, marginBottom } = getCollapsedMargins(targetBlockElem)
  const isCustomBlock = targetBlockElem.hasAttribute('data-block-type')
  const isNestedParagraph =
    targetBlockElem.tagName === 'P' && targetBlockElem.closest('[data-block-type]')

  const baseSpacing =
    dropMode === 'before' ? Math.max(marginTop / 2, 8) : Math.max(marginBottom / 2, 8)

  // Adjust for different contexts
  if (isCustomBlock) {
    // Root-level custom blocks: center in existing gap
    return Math.max(baseSpacing / 2, 4)
  }

  if (isNestedParagraph) {
    // Content inside custom blocks: reduced spacing
    return Math.max(baseSpacing / 2, 4)
  }

  return baseSpacing
}

function handleBeforePosition(
  targetBlockElem: HTMLElement,
  lineTop: number,
  spacing: number,
): number {
  const parentBlock = targetBlockElem.closest('[data-block-type]')

  // Special handling for content inside custom blocks to avoid header overlap
  if (parentBlock && targetBlockElem.tagName === 'P') {
    const header = parentBlock.querySelector('[data-lexical-editor="false"]')
    if (header) {
      const headerRect = header.getBoundingClientRect()
      const minTopPosition = headerRect.bottom + 4
      const proposedTop = lineTop - spacing

      return proposedTop < minTopPosition ? minTopPosition : proposedTop
    }
  }

  return lineTop - spacing
}

function applyTargetLineStyles(
  targetLineElem: HTMLElement,
  { left, width, top }: { left: number; width: number; top: number },
) {
  targetLineElem.style.transform = `translate(${left}px, ${top}px)`
  targetLineElem.style.width = `${width}px`
  targetLineElem.style.opacity = '.4'
}

export function setTargetLine(
  targetLineElem: HTMLElement,
  targetBlockElem: HTMLElement,
  _mouseY: number,
  anchorElem: HTMLElement,
  dropMode: 'inside' | 'before' | 'after' = 'after',
) {
  const targetRect = targetBlockElem.getBoundingClientRect()
  const anchorRect = anchorElem.getBoundingClientRect()
  const { lineLeft, lineWidth } = calculateLineDimensions(targetBlockElem, anchorRect)
  let lineTop = targetRect.top
  const spacing = calculateSpacing(targetBlockElem, dropMode)

  switch (dropMode) {
    case 'inside':
      lineTop += targetRect.height - 8
      return applyTargetLineStyles(targetLineElem, {
        left: lineLeft + 16,
        width: lineWidth - 32,
        top: lineTop - anchorRect.top - TARGET_LINE_HALF_HEIGHT,
      })

    case 'before':
      lineTop = handleBeforePosition(targetBlockElem, lineTop, spacing)
      break

    case 'after':
      lineTop += targetRect.height + spacing
      break
  }

  applyTargetLineStyles(targetLineElem, {
    left: lineLeft,
    width: lineWidth,
    top: lineTop - anchorRect.top - TARGET_LINE_HALF_HEIGHT,
  })
}

export function hideTargetLine(targetLineElem: HTMLElement | null) {
  if (targetLineElem) {
    targetLineElem.style.opacity = '0'
    targetLineElem.style.transform = 'translate(-10000px, -10000px)'
  }
}
