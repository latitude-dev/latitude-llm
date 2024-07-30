import { cookies } from 'next/headers'

export enum ResizableGroups {
  DocumentSidebar = 'document-sidebar',
}
/**
 * This method is meant to be used in a nextjs page with access to the cookies object.
 */
export function getResizablePanelGroupData({
  group,
}: {
  group: ResizableGroups
}): number[] | undefined {
  const layout = cookies().get(`react-resizable-panels:${group}`)
  let layoutData = undefined

  try {
    if (layout) {
      layoutData = JSON.parse(layout.value)
    }
  } catch {
    // do nothing
  }

  return layoutData
}
