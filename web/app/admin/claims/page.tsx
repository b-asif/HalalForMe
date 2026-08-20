import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/admin/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  approveSubmission,
  rejectSubmission,
  approveClaim,
  rejectClaim,
  approveMsaRequest,
  rejectMsaRequest,
} from './actions'

interface Props {
  searchParams: Promise<{ tab?: string; error?: string; success?: string }>
}

export default async function ClaimsPage({ searchParams }: Props) {
  await requireAdmin()
  const supabase = await createClient()

  const sp = await searchParams
  const activeTab = sp.tab ?? 'submissions'

  const [
    { data: submissions },
    { data: claims },
    { data: msaRequests },
  ] = await Promise.all([
    supabase
      .from('submissions')
      .select('id, name, address, cuisine_type, status, created_at, user_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('restaurant_claims')
      .select('id, contact_name, contact_email, role, message, status, created_at, restaurant_id, restaurants(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('msa_onboarding_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const tabs = [
    { key: 'submissions', label: `Submissions (${(submissions ?? []).length})` },
    { key: 'claims', label: `Claims (${(claims ?? []).length})` },
    { key: 'msa', label: `MSA Requests (${(msaRequests ?? []).length})` },
  ]

  return (
    <div>
      <PageHeader title="Claims & Submissions" subtitle="Pending items requiring admin action" />

      {sp.success && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#D1FAE5', color: '#245737', border: '1px solid #A7F3D0' }}>
          Action completed successfully.
        </div>
      )}
      {sp.error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#FEE2E2', color: '#C0392B', border: '1px solid #FECACA' }}>
          Error: {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: '1px solid #EAE3D3' }}>
        {tabs.map((tab) => (
          <a
            key={tab.key}
            href={`/admin/claims?tab=${tab.key}`}
            className="px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: activeTab === tab.key ? '#245737' : '#8C8776',
              borderBottom: activeTab === tab.key ? '2px solid #245737' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* Submissions tab */}
      {activeTab === 'submissions' && (
        <div className="space-y-3">
          {(submissions ?? []).length === 0 ? (
            <div className="rounded-lg p-8 text-center" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
              <p className="text-sm" style={{ color: '#8C8776' }}>No pending submissions.</p>
            </div>
          ) : (
            (submissions ?? []).map((s) => (
              <div key={s.id} className="rounded-lg p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold" style={{ color: '#20241F' }}>{s.name}</h3>
                      <StatusBadge status={s.status} />
                    </div>
                    {s.address && <p className="text-xs" style={{ color: '#8C8776' }}>{s.address}</p>}
                    {s.cuisine_type && <p className="text-xs" style={{ color: '#8C8776' }}>{s.cuisine_type}</p>}
                    <p className="text-xs mt-1" style={{ color: '#8C8776' }}>
                      Submitted {new Date(s.created_at as string).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <form action={approveSubmission.bind(null, s.id)}>
                      <button type="submit"
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={{ backgroundColor: '#D1FAE5', color: '#245737', border: '1px solid #A7F3D0' }}>
                        Approve
                      </button>
                    </form>
                    <form action={rejectSubmission.bind(null, s.id)} className="flex items-center gap-1">
                      <input name="reason" placeholder="Reason (optional)"
                        className="rounded-lg px-2 py-1.5 text-xs"
                        style={{ border: '1px solid #EAE3D3', color: '#20241F', width: '140px' }} />
                      <button type="submit"
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={{ backgroundColor: '#FEE2E2', color: '#C0392B', border: '1px solid #FECACA' }}>
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Claims tab */}
      {activeTab === 'claims' && (
        <div className="space-y-3">
          {(claims ?? []).length === 0 ? (
            <div className="rounded-lg p-8 text-center" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
              <p className="text-sm" style={{ color: '#8C8776' }}>No pending claims.</p>
            </div>
          ) : (
            (claims ?? []).map((c) => {
              const restaurant = Array.isArray(c.restaurants) ? c.restaurants[0] : c.restaurants
              return (
                <div key={c.id} className="rounded-lg p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold" style={{ color: '#20241F' }}>
                          {c.contact_name}
                        </h3>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="text-xs" style={{ color: '#8C8776' }}>
                        Claiming: <span style={{ color: '#20241F' }}>{restaurant?.name ?? c.restaurant_id}</span>
                      </p>
                      <p className="text-xs" style={{ color: '#8C8776' }}>{c.contact_email} · {c.role}</p>
                      {c.message && (
                        <p className="text-xs mt-1 italic" style={{ color: '#8C8776' }}>"{c.message}"</p>
                      )}
                      <p className="text-xs mt-1" style={{ color: '#8C8776' }}>
                        Submitted {new Date(c.created_at as string).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <form action={approveClaim.bind(null, c.id)}>
                        <button type="submit"
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                          style={{ backgroundColor: '#D1FAE5', color: '#245737', border: '1px solid #A7F3D0' }}>
                          Approve
                        </button>
                      </form>
                      <form action={rejectClaim.bind(null, c.id)} className="flex items-center gap-1">
                        <input name="reason" placeholder="Reason (optional)"
                          className="rounded-lg px-2 py-1.5 text-xs"
                          style={{ border: '1px solid #EAE3D3', color: '#20241F', width: '140px' }} />
                        <button type="submit"
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                          style={{ backgroundColor: '#FEE2E2', color: '#C0392B', border: '1px solid #FECACA' }}>
                          Reject
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* MSA Requests tab */}
      {activeTab === 'msa' && (
        <div className="space-y-3">
          {(msaRequests ?? []).length === 0 ? (
            <div className="rounded-lg p-8 text-center" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
              <p className="text-sm" style={{ color: '#8C8776' }}>No pending MSA requests.</p>
            </div>
          ) : (
            (msaRequests ?? []).map((r) => (
              <div key={r.id} className="rounded-lg p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold" style={{ color: '#20241F' }}>
                        {r.university_name ?? 'Unknown University'}
                      </h3>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs" style={{ color: '#8C8776' }}>
                      Contact: {r.contact_name} — {r.contact_email ?? r.contact_phone ?? ''}
                    </p>
                    {r.msa_name && (
                      <p className="text-xs" style={{ color: '#8C8776' }}>MSA: {r.msa_name}</p>
                    )}
                    {r.notes && (
                      <p className="text-xs mt-1 italic" style={{ color: '#8C8776' }}>"{r.notes}"</p>
                    )}
                    <p className="text-xs mt-1" style={{ color: '#8C8776' }}>
                      Submitted {new Date(r.created_at as string).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <form action={approveMsaRequest.bind(null, r.id)}>
                      <button type="submit"
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={{ backgroundColor: '#D1FAE5', color: '#245737', border: '1px solid #A7F3D0' }}>
                        Approve
                      </button>
                    </form>
                    <form action={rejectMsaRequest.bind(null, r.id)} className="flex items-center gap-1">
                      <input name="reason" placeholder="Reason (optional)"
                        className="rounded-lg px-2 py-1.5 text-xs"
                        style={{ border: '1px solid #EAE3D3', color: '#20241F', width: '140px' }} />
                      <button type="submit"
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={{ backgroundColor: '#FEE2E2', color: '#C0392B', border: '1px solid #FECACA' }}>
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
