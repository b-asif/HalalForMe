import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/admin/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { Suspense } from 'react'

const LIMIT = 50

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>
}

export default async function GuidesPage({ searchParams }: Props) {
  await requireAdmin()
  const supabase = await createClient()

  const params = await searchParams
  const q = params.q ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const offset = (page - 1) * LIMIT

  let query = supabase
    .from('guides')
    .select('id, title, category, is_featured, is_published, position, created_at', { count: 'exact' })
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })
    .range(offset, offset + LIMIT - 1)

  if (q) query = query.ilike('title', `%${q}%`)

  const { data: guides, count } = await query

  // Fetch item counts per guide
  const guideIds = (guides ?? []).map((g) => g.id)
  const { data: itemCounts } = guideIds.length
    ? await supabase
        .from('guide_items')
        .select('guide_id')
        .in('guide_id', guideIds)
    : { data: [] }

  const itemCountMap: Record<string, number> = {}
  for (const row of itemCounts ?? []) {
    itemCountMap[row.guide_id] = (itemCountMap[row.guide_id] ?? 0) + 1
  }

  return (
    <div>
      <PageHeader
        title="Guides"
        subtitle="Curated collections of restaurants and places"
        action={{ label: '+ New Guide', href: '/admin/guides/new' }}
      />

      <div className="flex items-center gap-3 mb-5">
        <Suspense>
          <SearchInput placeholder="Search by title…" defaultValue={q} />
        </Suspense>
      </div>

      <div
        className="rounded-lg overflow-hidden"
        style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #EAE3D3', backgroundColor: '#F7F2E7' }}>
              {['Title', 'Category', 'Featured', 'Published', 'Items', 'Position', 'Created'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-xs"
                  style={{ color: '#8C8776' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(guides ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: '#8C8776' }}>
                  No guides found.
                </td>
              </tr>
            ) : (
              (guides ?? []).map((g) => (
                <tr key={g.id} style={{ borderBottom: '1px solid #EAE3D3' }}>
                  <td className="px-4 py-3">
                    <a href={`/admin/guides/${g.id}`} className="font-medium hover:underline" style={{ color: '#245737' }}>
                      {g.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 capitalize" style={{ color: '#8C8776' }}>{g.category}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={g.is_featured ? 'verified' : 'draft'} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={g.is_published ? 'published' : 'unpublished'} />
                  </td>
                  <td className="px-4 py-3" style={{ color: '#20241F' }}>{itemCountMap[g.id] ?? 0}</td>
                  <td className="px-4 py-3" style={{ color: '#8C8776' }}>{g.position}</td>
                  <td className="px-4 py-3" style={{ color: '#8C8776' }}>
                    {new Date(g.created_at as string).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        total={count ?? 0}
        limit={LIMIT}
        basePath="/admin/guides"
        searchParams={q ? { q } : {}}
      />
    </div>
  )
}
