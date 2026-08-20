interface PaginationProps {
  page: number
  total: number
  limit: number
  basePath: string
  searchParams?: Record<string, string>
}

export function Pagination({ page, total, limit, basePath, searchParams = {} }: PaginationProps) {
  const totalPages = Math.ceil(total / limit)
  if (totalPages <= 1) return null

  const buildUrl = (p: number) => {
    const params = new URLSearchParams({ ...searchParams, page: String(p) })
    return `${basePath}?${params.toString()}`
  }

  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-sm" style={{ color: '#8C8776' }}>
        Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <a
            href={buildUrl(page - 1)}
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
          >
            Previous
          </a>
        ) : (
          <span
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium opacity-40"
            style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
          >
            Previous
          </span>
        )}
        <span className="text-sm" style={{ color: '#8C8776' }}>
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <a
            href={buildUrl(page + 1)}
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
          >
            Next
          </a>
        ) : (
          <span
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium opacity-40"
            style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
          >
            Next
          </span>
        )}
      </div>
    </div>
  )
}
