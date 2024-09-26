import { IPagination } from '@latitude-data/core/lib/buildPagination'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@latitude-data/web-ui'
import Link from 'next/link'

export default function WebPagination({
  currentPage,
  prevPage,
  pageItems,
  nextPage,
}: IPagination) {
  return (
    <Pagination aria-label='Pagination'>
      <PaginationContent>
        {prevPage && (
          <Link href={prevPage.url}>
            <PaginationPrevious />
          </Link>
        )}
        {pageItems.map((item, idx) => {
          return (
            <PaginationItem key={idx}>
              {item.type === 'page' ? (
                <Link href={item.url}>
                  <PaginationLink isActive={item.value === currentPage}>
                    {item.value}
                  </PaginationLink>
                </Link>
              ) : (
                <PaginationEllipsis />
              )}
            </PaginationItem>
          )
        })}
        {nextPage && (
          <Link href={nextPage.url}>
            <PaginationNext />
          </Link>
        )}
      </PaginationContent>
    </Pagination>
  )
}
