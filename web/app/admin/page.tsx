import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/admin/PageHeader'

interface StatCardProps {
  label: string
  value: number
  href: string
  accent?: boolean
}

function StatCard({ label, value, href, accent = false }: StatCardProps) {
  return (
    <a
      href={href}
      className="block rounded-lg p-5 transition-shadow hover:shadow-md"
      style={{
        backgroundColor: accent ? '#1F3D2B' : '#ffffff',
        border: `1px solid ${accent ? '#1F3D2B' : '#EAE3D3'}`,
      }}
    >
      <p
        className="text-sm font-medium mb-1"
        style={{ color: accent ? 'rgba(247,242,231,0.7)' : '#8C8776' }}
      >
        {label}
      </p>
      <p
        className="text-3xl font-bold"
        style={{ color: accent ? '#F7F2E7' : '#20241F' }}
      >
        {value.toLocaleString()}
      </p>
    </a>
  )
}

interface PendingItem {
  id: string
  label: string
  sub?: string
  href: string
  type: string
}

export default async function AdminOverviewPage() {
  await requireAdmin()
  const supabase = await createClient()

  // Fetch counts in parallel
  const [
    { count: restaurantsCount },
    { count: mosquesCount },
    { count: universitiesCount },
    { count: msasCount },
    { count: profilesCount },
    { count: pendingSubmissionsCount },
    { count: pendingClaimsCount },
    { count: pendingMsaRequestsCount },
    { count: pendingReviewsCount },
    pendingSubmissionsData,
    pendingClaimsData,
    pendingMsaData,
  ] = await Promise.all([
    supabase.from('restaurants').select('*', { count: 'exact', head: true }),
    supabase.from('mosques').select('*', { count: 'exact', head: true }),
    supabase.from('universities').select('*', { count: 'exact', head: true }),
    supabase.from('msas').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('restaurant_claims').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('msa_onboarding_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('submissions').select('id, name, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
    supabase.from('restaurant_claims').select('id, contact_name, contact_email, created_at, restaurant_id').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
    supabase.from('msa_onboarding_requests').select('id, university_name, contact_name, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
  ])

  const totalAttention =
    (pendingSubmissionsCount ?? 0) +
    (pendingClaimsCount ?? 0) +
    (pendingMsaRequestsCount ?? 0) +
    (pendingReviewsCount ?? 0)

  const stats = [
    { label: 'Businesses', value: restaurantsCount ?? 0, href: '/admin/businesses' },
    { label: 'Mosques', value: mosquesCount ?? 0, href: '/admin/mosques' },
    { label: 'Universities', value: universitiesCount ?? 0, href: '/admin/campuses' },
    { label: 'MSAs', value: msasCount ?? 0, href: '/admin/campuses' },
    { label: 'Users', value: profilesCount ?? 0, href: '/admin/users' },
    { label: 'Pending Reviews', value: pendingReviewsCount ?? 0, href: '/admin/claims' },
  ]

  return (
    <div>
      <PageHeader title="Overview" subtitle="Rihdal admin dashboard" />

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Needs attention */}
      {totalAttention > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4" style={{ color: '#20241F' }}>
            Needs Attention
            <span
              className="ml-2 inline-flex items-center justify-center rounded-full w-6 h-6 text-xs font-bold"
              style={{ backgroundColor: '#C0392B', color: '#ffffff' }}
            >
              {totalAttention}
            </span>
          </h2>

          <div className="space-y-4">
            {/* Pending submissions */}
            {(pendingSubmissionsData.data?.length ?? 0) > 0 && (
              <div
                className="rounded-lg p-5"
                style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold" style={{ color: '#20241F' }}>
                    Business Submissions
                    <span
                      className="ml-2 text-xs font-bold rounded-full px-2 py-0.5"
                      style={{ backgroundColor: '#FEF3C7', color: '#B7791F' }}
                    >
                      {pendingSubmissionsCount} pending
                    </span>
                  </h3>
                  <a href="/admin/claims" className="text-xs font-medium" style={{ color: '#245737' }}>
                    View all →
                  </a>
                </div>
                <ul className="space-y-2">
                  {pendingSubmissionsData.data?.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <span style={{ color: '#20241F' }}>{s.name}</span>
                      <span style={{ color: '#8C8776' }}>
                        {new Date(s.created_at as string).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Pending claims */}
            {(pendingClaimsData.data?.length ?? 0) > 0 && (
              <div
                className="rounded-lg p-5"
                style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold" style={{ color: '#20241F' }}>
                    Restaurant Claims
                    <span
                      className="ml-2 text-xs font-bold rounded-full px-2 py-0.5"
                      style={{ backgroundColor: '#FEF3C7', color: '#B7791F' }}
                    >
                      {pendingClaimsCount} pending
                    </span>
                  </h3>
                  <a href="/admin/claims" className="text-xs font-medium" style={{ color: '#245737' }}>
                    View all →
                  </a>
                </div>
                <ul className="space-y-2">
                  {pendingClaimsData.data?.map((c) => (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span style={{ color: '#20241F' }}>{c.contact_name}</span>
                      <span style={{ color: '#8C8776' }}>
                        {new Date(c.created_at as string).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Pending MSA requests */}
            {(pendingMsaData.data?.length ?? 0) > 0 && (
              <div
                className="rounded-lg p-5"
                style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold" style={{ color: '#20241F' }}>
                    MSA Onboarding Requests
                    <span
                      className="ml-2 text-xs font-bold rounded-full px-2 py-0.5"
                      style={{ backgroundColor: '#FEF3C7', color: '#B7791F' }}
                    >
                      {pendingMsaRequestsCount} pending
                    </span>
                  </h3>
                  <a href="/admin/claims" className="text-xs font-medium" style={{ color: '#245737' }}>
                    View all →
                  </a>
                </div>
                <ul className="space-y-2">
                  {pendingMsaData.data?.map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-sm">
                      <span style={{ color: '#20241F' }}>
                        {r.university_name} — {r.contact_name}
                      </span>
                      <span style={{ color: '#8C8776' }}>
                        {new Date(r.created_at as string).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {totalAttention === 0 && (
        <div
          className="rounded-lg p-8 text-center"
          style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}
        >
          <p className="text-sm font-medium" style={{ color: '#245737' }}>
            All caught up — no pending items.
          </p>
        </div>
      )}
    </div>
  )
}
