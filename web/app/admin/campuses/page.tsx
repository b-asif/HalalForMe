import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/admin/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Suspense } from 'react'

const LIMIT = 50

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>
}

export default async function CampusesPage({ searchParams }: Props) {
  await requireAdmin()
  const supabase = await createClient()

  const params = await searchParams
  const q = params.q ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const offset = (page - 1) * LIMIT

  let query = supabase
    .from('universities')
    .select('id, name, city, state, is_verified, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + LIMIT - 1)

  if (q) query = query.ilike('name', `%${q}%`)

  const { data: universities, count } = await query

  // Fetch MSA counts per university
  const universityIds = (universities ?? []).map((u) => u.id)
  const { data: msaCounts } = universityIds.length
    ? await supabase
        .from('msas')
        .select('university_id')
        .in('university_id', universityIds)
    : { data: [] }

  const msaCountMap: Record<string, number> = {}
  for (const row of msaCounts ?? []) {
    msaCountMap[row.university_id] = (msaCountMap[row.university_id] ?? 0) + 1
  }

  return (
    <div>
      <PageHeader
        title="Campuses"
        subtitle="Universities and MSAs"
        action={{ label: '+ New Campus', href: '/admin/campuses/new' }}
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
              {['University Name', 'City', 'State', 'MSA Count', 'Verified', 'Created'].map((h) => (
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
            {(universities ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: '#8C8776' }}>
                  No universities found.
                </td>
              </tr>
            ) : (
              (universities ?? []).map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #EAE3D3' }}>
                  <td className="px-4 py-3">
                    <a
                      href={`/admin/campuses/${u.id}`}
                      className="font-medium hover:underline"
                      style={{ color: '#245737' }}
                    >
                      {u.name}
                    </a>
                  </td>
                  <td className="px-4 py-3" style={{ color: '#8C8776' }}>{u.city ?? '—'}</td>
                  <td className="px-4 py-3" style={{ color: '#8C8776' }}>{u.state ?? '—'}</td>
                  <td className="px-4 py-3" style={{ color: '#20241F' }}>{msaCountMap[u.id] ?? 0}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.is_verified ? 'verified' : 'pending'} />
                  </td>
                  <td className="px-4 py-3" style={{ color: '#8C8776' }}>
                    {new Date(u.created_at as string).toLocaleDateString()}
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
        basePath="/admin/campuses"
        searchParams={q ? { q } : {}}
      />
    </div>
  )
}
