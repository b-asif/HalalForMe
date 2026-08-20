import { requireAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/admin/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { Suspense } from 'react'

const LIMIT = 50

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>
}

export default async function UsersPage({ searchParams }: Props) {
  await requireAdmin()
  // Use service role client to bypass RLS on profiles and access auth.users
  const supabase = await createAdminClient()

  const params = await searchParams
  const q = params.q ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const offset = (page - 1) * LIMIT

  let query = supabase
    .from('profiles')
    .select('id, name, is_admin, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + LIMIT - 1)

  if (q) query = query.ilike('name', `%${q}%`)

  const { data: profiles, count } = await query

  // Fetch emails from auth.users for these profiles (service role required)
  const profileIds = (profiles ?? []).map((p) => p.id)
  let emailMap: Record<string, string> = {}

  if (profileIds.length > 0) {
    // Use the admin API to list users
    const { data: authData } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (authData?.users) {
      for (const u of authData.users) {
        if (profileIds.includes(u.id)) {
          emailMap[u.id] = u.email ?? ''
        }
      }
    }
  }

  return (
    <div>
      <PageHeader title="Users" subtitle="All registered Rihdal accounts" />

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
              {['Name', 'Email', 'Admin', 'Joined'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-xs"
                  style={{ color: '#8C8776' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: '#8C8776' }}>
                  No users found.
                </td>
              </tr>
            ) : (
              (profiles ?? []).map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #EAE3D3' }}>
                  <td className="px-4 py-3" style={{ color: '#20241F' }}>
                    {p.name ?? <span style={{ color: '#8C8776' }}>—</span>}
                  </td>
                  <td className="px-4 py-3" style={{ color: '#8C8776' }}>
                    {emailMap[p.id] ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {p.is_admin ? (
                      <StatusBadge status="verified" />
                    ) : (
                      <span className="text-xs" style={{ color: '#8C8776' }}>No</span>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: '#8C8776' }}>
                    {new Date(p.created_at as string).toLocaleDateString()}
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
        basePath="/admin/users"
        searchParams={q ? { q } : {}}
      />
    </div>
  )
}
