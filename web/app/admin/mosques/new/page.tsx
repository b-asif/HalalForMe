import { requireAdmin } from '@/lib/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/admin/PageHeader'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

async function createMosque(formData: FormData) {
  'use server'
  await requireAdmin()
  const supabase = await createClient()

  const iqamaTimesRaw = formData.get('iqama_times') as string
  let iqama_times: Record<string, unknown> | null = null
  if (iqamaTimesRaw) {
    try {
      iqama_times = JSON.parse(iqamaTimesRaw)
    } catch {
      redirect(`/admin/mosques/new?error=${encodeURIComponent('Invalid JSON in iqama times')}`)
    }
  }

  const osmId = formData.get('osm_id') as string
  if (!osmId) {
    redirect(`/admin/mosques/new?error=${encodeURIComponent('OSM ID is required')}`)
  }

  const record = {
    osm_id: osmId,
    name: formData.get('name') as string,
    address: formData.get('address') as string || null,
    lat: formData.get('lat') ? parseFloat(formData.get('lat') as string) : null,
    lng: formData.get('lng') ? parseFloat(formData.get('lng') as string) : null,
    description: formData.get('description') as string || null,
    contact_phone: formData.get('contact_phone') as string || null,
    contact_email: formData.get('contact_email') as string || null,
    website: formData.get('website') as string || null,
    invite_code: generateInviteCode(),
    iqama_times,
  }

  const { data, error } = await supabase.from('mosques').insert(record).select('id').single()

  if (error) {
    redirect(`/admin/mosques/new?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/mosques')
  redirect(`/admin/mosques/${data.id}?success=1`)
}

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function NewMosquePage({ searchParams }: Props) {
  await requireAdmin()
  const sp = await searchParams

  // Generate a preview invite code (the actual one is generated server-side on submit)
  const previewCode = Array.from({ length: 8 }, () =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
  ).join('')

  return (
    <div>
      <PageHeader title="New Mosque" subtitle="Onboard a new mosque page" />

      {sp.error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#FEE2E2', color: '#C0392B', border: '1px solid #FECACA' }}>
          Error: {decodeURIComponent(sp.error)}
        </div>
      )}

      <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#FEF3C7', color: '#B7791F', border: '1px solid #FDE68A' }}>
        An 8-character invite code will be auto-generated when you create this mosque. Share it with the mosque contact to allow them to claim the page.
      </div>

      <div className="max-w-2xl">
        <div className="rounded-lg p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
          <form action={createMosque} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>
                  OSM ID *
                  <span className="ml-1 text-xs font-normal" style={{ color: '#8C8776' }}>
                    (e.g. node/12345 or way/67890)
                  </span>
                </label>
                <input
                  name="osm_id"
                  required
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="node/12345"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Name *</label>
                <input
                  name="name"
                  required
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="Mosque name"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Address</label>
                <input
                  name="address"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="123 Main St, City, State"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Latitude</label>
                <input
                  name="lat"
                  type="number"
                  step="any"
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
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Description</label>
                <textarea
                  name="description"
                  rows={3}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Phone</label>
                <input
                  name="contact_phone"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Email</label>
                <input
                  name="contact_email"
                  type="email"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Website</label>
                <input
                  name="website"
                  type="url"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>
                  Iqama Times (JSON, optional)
                </label>
                <textarea
                  name="iqama_times"
                  rows={4}
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder='{"fajr": "5:30 AM", "dhuhr": "1:15 PM", "asr": "4:45 PM", "maghrib": "sunset", "isha": "9:00 PM"}'
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: '#245737', color: '#ffffff' }}
              >
                Create Mosque
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
    </div>
  )
}
