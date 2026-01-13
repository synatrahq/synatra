import { createSignal, createMemo, createEffect, on } from "solid-js"
import { CaretLeft, CaretRight } from "phosphor-solid-js"
import { IconButton } from "./icon-button"

type TablePaginationProps<T> = {
  data: T[]
  pageSize?: number
  children: (paginatedData: T[], info: { start: number; end: number; total: number; padRows: number }) => any
}

export function TablePagination<T>(props: TablePaginationProps<T>) {
  const [page, setPage] = createSignal(0)
  const pageSize = () => props.pageSize ?? 10

  createEffect(
    on(
      () => props.data.length,
      () => setPage(0),
    ),
  )

  const total = () => props.data.length
  const totalPages = () => Math.max(1, Math.ceil(total() / pageSize()))
  const start = () => page() * pageSize()
  const end = () => Math.min(start() + pageSize(), total())
  const paginatedData = createMemo(() => props.data.slice(start(), end()))
  const hasPrev = () => page() > 0
  const hasNext = () => page() < totalPages() - 1
  const padRows = () => (total() > pageSize() ? pageSize() - paginatedData().length : 0)

  const prev = () => hasPrev() && setPage((p) => p - 1)
  const next = () => hasNext() && setPage((p) => p + 1)

  return (
    <>
      {props.children(paginatedData(), { start: start() + 1, end: end(), total: total(), padRows: padRows() })}
      {total() > pageSize() && (
        <div class="flex items-center justify-between px-3 py-2 border-t border-border">
          <span class="text-2xs text-text-muted">
            {start() + 1}-{end()} of {total()}
          </span>
          <div class="flex items-center gap-1">
            <IconButton size="xs" variant="ghost" onClick={prev} disabled={!hasPrev()}>
              <CaretLeft size={12} />
            </IconButton>
            <span class="text-2xs text-text-muted min-w-[3rem] text-center">
              {page() + 1} / {totalPages()}
            </span>
            <IconButton size="xs" variant="ghost" onClick={next} disabled={!hasNext()}>
              <CaretRight size={12} />
            </IconButton>
          </div>
        </div>
      )}
    </>
  )
}
