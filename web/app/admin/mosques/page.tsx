import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/admin/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { Suspense } from 'react'

const LIMIT = 50

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>
}

export default async function MosquesPage({ searchParams }: Props) {
  await requireAdmin()
  const supabase = await createClient()

  const params = await searchParams
  const q = params.q ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const offset = (page - 1) * LIMIT

  let query = supabase
    .from('mosques')
    .select('id, name, address, owner_id, iqama_times, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + LIMIT - 1)

  if (q) query = query.ilike('name', `%${q}%`)

  const { data: mosques, count } = await query

  return (
    <div>
      <PageHeader
        title="Mosques"
        subtitle="Admin-onboarded mosque pages"
        action={{ label: '+ New Mosque', href: '/admin/mosques/new' }}
      />

      <div className="flex items-center gap-3 mb-5">
        <Suspense>
          <SearchInput placeholder="Search by name…" defaultValue={q} />
        </Suspense>
      </div>

      <div
        className="rounded-lg overflow-hidden"
        style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #EAE3D3', backgroundColor: '#F7F2E7' }}>
              {['Name', 'Address', 'Has Iqama Times', 'Owner Set', 'Created'].map((h) => (
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
            {(mosques ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#8C8776' }}>
                  No mosques found.
                </td>
              </tr>
            ) : (
              (mosques ?? []).map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid #EAE3D3' }}>
                  <td className="px-4 py-3">
                    <a
                      href={`/admin/mosques/${m.id}`}
                      className="font-medium hover:underline"
                      style={{ color: '#245737' }}
                    >
                      {m.name}
                    </a>
                  </td>
                  <td className="px-4 py-3" style={{ color: '#8C8776' }}>
                    {m.address ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={
                        m.iqama_times
                          ? { backgroundColor: '#D1FAE5', color: '#245737' }
                          : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                      }
                    >
                      {m.iqama_times ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={
                        m.owner_id
                          ? { backgroundColor: '#D1FAE5', color: '#245737' }
                          : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                      }
                    >
                      {m.owner_id ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: '#8C8776' }}>
                    {new Date(m.created_at as string).toLocaleDateString()}
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
        basePath="/admin/mosques"
        searchParams={q ? { q } : {}}
      />
    </div>
  )
}
