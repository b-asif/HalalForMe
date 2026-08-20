import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { updateMosque, deleteMosque } from './actions'
import { PageHeader } from '@/components/admin/PageHeader'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}

export default async function MosqueDetailPage({ params, searchParams }: Props) {
  await requireAdmin()
  const supabase = await createClient()

  const { id } = await params
  const sp = await searchParams

  const { data: mosque } = await supabase
    .from('mosques')
    .select('*')
    .eq('id', id)
    .single()

  if (!mosque) notFound()

  const updateMosqueWithId = updateMosque.bind(null, id)
  const deleteMosqueWithId = deleteMosque.bind(null, id)

  return (
    <div>
      <PageHeader title={mosque.name} subtitle={mosque.address ?? undefined} />

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
        <div className="lg:col-span-2">
          <div className="rounded-lg p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
            <h2 className="text-base font-semibold mb-5" style={{ color: '#20241F' }}>Edit Mosque</h2>
            <form action={updateMosqueWithId} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Name *</label>
                  <input
                    name="name"
                    defaultValue={mosque.name}
                    required
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Address</label>
                  <input
                    name="address"
                    defaultValue={mosque.address ?? ''}
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
                    defaultValue={mosque.lat ?? ''}
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
                    defaultValue={mosque.lng ?? ''}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Description</label>
                  <textarea
                    name="description"
                    defaultValue={mosque.description ?? ''}
                    rows={3}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Phone</label>
                  <input
                    name="contact_phone"
                    defaultValue={mosque.contact_phone ?? ''}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Email</label>
                  <input
                    name="contact_email"
                    type="email"
                    defaultValue={mosque.contact_email ?? ''}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Website</label>
                  <input
                    name="website"
                    type="url"
                    defaultValue={mosque.website ?? ''}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>
                    Iqama Times (JSON)
                  </label>
                  <textarea
                    name="iqama_times"
                    defaultValue={mosque.iqama_times ? JSON.stringify(mosque.iqama_times, null, 2) : ''}
                    rows={6}
                    className="w-full rounded-lg px-3 py-2 text-sm font-mono"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                    placeholder='{"fajr": "5:30 AM", "dhuhr": "1:15 PM", ...}'
                  />
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
                  href="/admin/mosques"
                  className="rounded-lg px-4 py-2 text-sm font-semibold"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                >
                  Cancel
                </a>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#20241F' }}>Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: '#8C8776' }}>Owner</span>
                <span style={{ color: '#20241F' }}>{mosque.owner_id ? 'Claimed' : 'Unclaimed'}</span>
              </div>
              {mosque.invite_code && (
                <div className="flex justify-between">
                  <span style={{ color: '#8C8776' }}>Invite Code</span>
                  <span className="font-mono font-bold" style={{ color: '#20241F' }}>{mosque.invite_code}</span>
                </div>
              )}
              {mosque.osm_id && (
                <div className="flex justify-between">
                  <span style={{ color: '#8C8776' }}>OSM ID</span>
                  <span className="font-mono text-xs" style={{ color: '#8C8776' }}>{mosque.osm_id}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: '#8C8776' }}>Created</span>
                <span style={{ color: '#20241F' }}>{new Date(mosque.created_at as string).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #FECACA' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#C0392B' }}>Danger Zone</h3>
            <details>
              <summary className="text-sm cursor-pointer font-medium" style={{ color: '#C0392B' }}>
                Delete this mosque
              </summary>
              <div className="mt-3">
                <p className="text-xs mb-3" style={{ color: '#8C8776' }}>
                  Permanently deletes this mosque page. The OSM location data remains unaffected.
                </p>
                <form action={deleteMosqueWithId}>
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
