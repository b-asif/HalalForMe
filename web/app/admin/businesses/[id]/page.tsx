import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { updateBusiness, deleteBusiness, verifyBusiness } from './actions'
import { PageHeader } from '@/components/admin/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}

export default async function BusinessDetailPage({ params, searchParams }: Props) {
  await requireAdmin()
  const supabase = await createClient()

  const { id } = await params
  const sp = await searchParams

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .single()

  if (!restaurant) notFound()

  // Fetch associated claim if any
  const { data: claim } = await supabase
    .from('restaurant_claims')
    .select('id, contact_name, contact_email, role, status, created_at')
    .eq('restaurant_id', id)
    .eq('status', 'approved')
    .maybeSingle()

  const updateBusinessWithId = updateBusiness.bind(null, id)
  const deleteBusinessWithId = deleteBusiness.bind(null, id)

  return (
    <div>
      <PageHeader
        title={restaurant.name}
        subtitle={restaurant.address ?? undefined}
      />

      {sp.success && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#D1FAE5', color: '#245737', border: '1px solid #A7F3D0' }}>
          Saved successfully.
        </div>
      )}
      {sp.error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#FEE2E2', color: '#C0392B', border: '1px solid #FECACA' }}>
          Error: {decodeURIComponent(sp.error)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Edit form */}
        <div className="lg:col-span-2">
          <div className="rounded-lg p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
            <h2 className="text-base font-semibold mb-5" style={{ color: '#20241F' }}>Edit Business</h2>
            <form action={updateBusinessWithId} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Name *</label>
                  <input
                    name="name"
                    defaultValue={restaurant.name}
                    required
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Address</label>
                  <input
                    name="address"
                    defaultValue={restaurant.address ?? ''}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Latitude</label>
                  <input
                    name="lat"
                    type="number"
                    step="any"
                    defaultValue={restaurant.lat ?? ''}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Longitude</label>
                  <input
                    name="lng"
                    type="number"
                    step="any"
                    defaultValue={restaurant.lng ?? ''}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Category</label>
                  <select
                    name="category"
                    defaultValue={restaurant.category ?? ''}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  >
                    <option value="">— None —</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="cafe">Cafe</option>
                    <option value="grocery">Grocery</option>
                    <option value="butcher">Butcher</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Cuisine Type</label>
                  <input
                    name="cuisine_type"
                    defaultValue={restaurant.cuisine_type ?? ''}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Primary Certifier</label>
                  <input
                    name="primary_certifier"
                    defaultValue={restaurant.primary_certifier ?? ''}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Zabihah Status</label>
                  <select
                    name="zabihah_status"
                    defaultValue={restaurant.zabihah_status ?? ''}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  >
                    <option value="">— None —</option>
                    <option value="full">Full</option>
                    <option value="partial">Partial</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Zabihah Notes</label>
                  <input
                    name="zabihah_notes"
                    defaultValue={restaurant.zabihah_notes ?? ''}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium" style={{ color: '#20241F' }}>Verified</label>
                  <select
                    name="is_verified"
                    defaultValue={String(restaurant.is_verified ?? false)}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium" style={{ color: '#20241F' }}>Has Prayer Room</label>
                  <select
                    name="has_prayer_room"
                    defaultValue={String(restaurant.has_prayer_room ?? false)}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="rounded-lg px-4 py-2 text-sm font-semibold"
                  style={{ backgroundColor: '#245737', color: '#ffffff' }}
                >
                  Save changes
                </button>
                <a
                  href="/admin/businesses"
                  className="rounded-lg px-4 py-2 text-sm font-semibold"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                >
                  Cancel
                </a>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-4">
          {/* Status card */}
          <div className="rounded-lg p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#20241F' }}>Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: '#8C8776' }}>Verified</span>
                <StatusBadge status={restaurant.is_verified ? 'verified' : 'pending'} />
              </div>
              {restaurant.category && (
                <div className="flex justify-between">
                  <span style={{ color: '#8C8776' }}>Category</span>
                  <span className="capitalize" style={{ color: '#20241F' }}>{restaurant.category}</span>
                </div>
              )}
              {restaurant.zabihah_status && (
                <div className="flex justify-between">
                  <span style={{ color: '#8C8776' }}>Zabihah</span>
                  <span className="capitalize" style={{ color: '#20241F' }}>{restaurant.zabihah_status}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: '#8C8776' }}>Prayer Room</span>
                <span style={{ color: '#20241F' }}>{restaurant.has_prayer_room ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#8C8776' }}>Created</span>
                <span style={{ color: '#20241F' }}>{new Date(restaurant.created_at as string).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Quick verify toggle */}
          <div className="rounded-lg p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#20241F' }}>Quick Actions</h3>
            <form action={verifyBusiness.bind(null, id, !restaurant.is_verified)}>
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2 text-sm font-medium"
                style={{
                  backgroundColor: restaurant.is_verified ? '#FEE2E2' : '#D1FAE5',
                  color: restaurant.is_verified ? '#C0392B' : '#245737',
                  border: `1px solid ${restaurant.is_verified ? '#FECACA' : '#A7F3D0'}`,
                }}
              >
                {restaurant.is_verified ? 'Unverify Business' : 'Verify Business'}
              </button>
            </form>
          </div>

          {/* Owner/claim info */}
          {claim && (
            <div className="rounded-lg p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: '#20241F' }}>Claimed By</h3>
              <div className="text-sm space-y-1">
                <p style={{ color: '#20241F' }}>{claim.contact_name}</p>
                <p style={{ color: '#8C8776' }}>{claim.contact_email}</p>
                <p style={{ color: '#8C8776' }} className="capitalize">{claim.role}</p>
              </div>
            </div>
          )}

          {/* Danger zone */}
          <div className="rounded-lg p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #FECACA' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#C0392B' }}>Danger Zone</h3>
            <details>
              <summary className="text-sm cursor-pointer font-medium" style={{ color: '#C0392B' }}>
                Delete this business
              </summary>
              <div className="mt-3">
                <p className="text-xs mb-3" style={{ color: '#8C8776' }}>
                  This permanently deletes the restaurant and all associated reviews, photos, and claims.
                </p>
                <form action={deleteBusinessWithId}>
                  <button
                    type="submit"
                    className="rounded-lg px-3 py-2 text-sm font-semibold"
                    style={{ backgroundColor: '#C0392B', color: '#ffffff' }}
                  >
                    Confirm Delete
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}
