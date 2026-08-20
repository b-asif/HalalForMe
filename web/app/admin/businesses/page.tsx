import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/admin/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { Suspense } from 'react'

const LIMIT = 50

const CATEGORIES = ['all', 'restaurant', 'cafe', 'grocery', 'butcher']

interface Props {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>
}

export default async function BusinessesPage({ searchParams }: Props) {
  await requireAdmin()
  const supabase = await createClient()

  const params = await searchParams
  const q = params.q ?? ''
  const category = params.category ?? 'all'
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const offset = (page - 1) * LIMIT

  let query = supabase
    .from('restaurants')
    .select('id, name, address, category, cuisine_type, is_verified, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + LIMIT - 1)

  if (q) query = query.ilike('name', `%${q}%`)
  if (category !== 'all') query = query.eq('category', category)

  const { data: restaurants, count } = await query

  return (
    <div>
      <PageHeader
        title="Businesses"
        subtitle="All restaurants, cafes, groceries, and butchers"
        action={{ label: '+ New Business', href: '/admin/businesses/new' }}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Suspense>
          <SearchInput placeholder="Search by name…" defaultValue={q} />
        </Suspense>
        <div className="flex items-center gap-1">
          {CATEGORIES.map((cat) => {
            const active = category === cat
            return (
              <a
                key={cat}
                href={`/admin/businesses?category=${cat}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                className="px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors"
                style={{
                  backgroundColor: active ? '#245737' : '#ffffff',
                  color: active ? '#ffffff' : '#20241F',
                  border: '1px solid #EAE3D3',
                }}
              >
                {cat}
              </a>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #EAE3D3', backgroundColor: '#F7F2E7' }}>
              {['Name', 'Address', 'Category', 'Cuisine', 'Verified', 'Created'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-xs"
                  style={{ color: '#8C8776' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(restaurants ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: '#8C8776' }}>
                  No businesses found.
                </td>
              </tr>
            ) : (
              (restaurants ?? []).map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: '1px solid #EAE3D3' }}
                >
                  <td className="px-4 py-3" style={{ color: '#20241F' }}>
                    <a
                      href={`/admin/businesses/${r.id}`}
                      className="font-medium hover:underline"
                      style={{ color: '#245737' }}
                    >
                      {r.name}
                    </a>
                  </td>
                  <td className="px-4 py-3" style={{ color: '#8C8776' }}>
                    {r.address ?? '—'}
                  </td>
                  <td className="px-4 py-3 capitalize" style={{ color: '#20241F' }}>
                    {r.category ?? '—'}
                  </td>
                  <td className="px-4 py-3" style={{ color: '#8C8776' }}>
                    {r.cuisine_type ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.is_verified ? 'verified' : 'pending'} />
                  </td>
                  <td className="px-4 py-3" style={{ color: '#8C8776' }}>
                    {new Date(r.created_at as string).toLocaleDateString()}
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
        basePath="/admin/businesses"
        searchParams={{ ...(q ? { q } : {}), ...(category !== 'all' ? { category } : {}) }}
      />
    </div>
  )
}
