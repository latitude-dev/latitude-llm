export function calculateOffset(page: string | number, pageSize: string | number) {
  const parsedPage = parseInt(String(page))
  const parsedPageSize = parseInt(String(pageSize))
  return (parsedPage - 1) * parsedPageSize
}
