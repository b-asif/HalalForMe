import { requireAdmin } from '@/lib/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/admin/PageHeader'

async function createBusiness(formData: FormData) {
  'use server'
  await requireAdmin()
  const supabase = await createClient()

  const record = {
    name: formData.get('name') as string,
    address: formData.get('address') as string || null,
    lat: formData.get('lat') ? parseFloat(formData.get('lat') as string) : null,
    lng: formData.get('lng') ? parseFloat(formData.get('lng') as string) : null,
    cuisine_type: formData.get('cuisine_type') as string || null,
    category: formData.get('category') as string || null,
    is_verified: formData.get('is_verified') === 'true',
    primary_certifier: formData.get('primary_certifier') as string || null,
    has_prayer_room: formData.get('has_prayer_room') === 'true',
    zabihah_status: formData.get('zabihah_status') as string || null,
    zabihah_notes: formData.get('zabihah_notes') as string || null,
  }

  const { data, error } = await supabase.from('restaurants').insert(record).select('id').single()

  if (error) {
    redirect(`/admin/businesses/new?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/businesses')
  redirect(`/admin/businesses/${data.id}?success=1`)
}

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function NewBusinessPage({ searchParams }: Props) {
  await requireAdmin()
  const sp = await searchParams

  return (
    <div>
      <PageHeader title="New Business" subtitle="Add a restaurant, cafe, grocery, or butcher" />

      {sp.error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#FEE2E2', color: '#C0392B', border: '1px solid #FECACA' }}>
          Error: {decodeURIComponent(sp.error)}
        </div>
      )}

      <div className="max-w-2xl">
        <div className="rounded-lg p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
          <form action={createBusiness} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Name *</label>
                <input
                  name="name"
                  required
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="Business name"
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
                  placeholder="40.7128"
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
                  placeholder="-74.0060"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Category</label>
                <select
                  name="category"
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
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="e.g. Pakistani, Middle Eastern"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Primary Certifier</label>
                <input
                  name="primary_certifier"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="e.g. HMA, ISWA"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Zabihah Status</label>
                <select
                  name="zabihah_status"
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
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="e.g. Beef & lamb only"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium" style={{ color: '#20241F' }}>Verified</label>
                <select
                  name="is_verified"
                  defaultValue="false"
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
                  defaultValue="false"
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
                Create Business
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
    </div>
  )
}
