import { requireAdmin } from '@/lib/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/admin/PageHeader'

async function createUniversity(formData: FormData) {
  'use server'
  await requireAdmin()
  const supabase = await createClient()

  const name = formData.get('name') as string
  const slug = (formData.get('slug') as string) ||
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const record = {
    name,
    slug,
    city: formData.get('city') as string || null,
    state: formData.get('state') as string || null,
    country: formData.get('country') as string || 'US',
    lat: formData.get('lat') ? parseFloat(formData.get('lat') as string) : null,
    lng: formData.get('lng') ? parseFloat(formData.get('lng') as string) : null,
    website: formData.get('website') as string || null,
    is_verified: formData.get('is_verified') === 'true',
  }

  const { data, error } = await supabase.from('universities').insert(record).select('id').single()

  if (error) {
    redirect(`/admin/campuses/new?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/campuses')
  redirect(`/admin/campuses/${data.id}?success=1`)
}

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function NewCampusPage({ searchParams }: Props) {
  await requireAdmin()
  const sp = await searchParams

  return (
    <div>
      <PageHeader title="New University" subtitle="Add a university campus" />

      {sp.error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#FEE2E2', color: '#C0392B', border: '1px solid #FECACA' }}>
          Error: {decodeURIComponent(sp.error)}
        </div>
      )}

      <div className="max-w-2xl">
        <div className="rounded-lg p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
          <form action={createUniversity} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>University Name *</label>
                <input name="name" required
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="University of Example" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>
                  Slug
                  <span className="ml-1 text-xs font-normal" style={{ color: '#8C8776' }}>(auto-generated if blank)</span>
                </label>
                <input name="slug"
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="university-of-example" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>City</label>
                <input name="city"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>State</label>
                <input name="state"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="CA" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Country</label>
                <input name="country" defaultValue="US"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Website</label>
                <input name="website" type="url"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Latitude</label>
                <input name="lat" type="number" step="any"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Longitude</label>
                <input name="lng" type="number" step="any"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium" style={{ color: '#20241F' }}>Verified</label>
                <select name="is_verified" defaultValue="false"
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}>
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: '#245737', color: '#ffffff' }}>
                Create University
              </button>
              <a href="/admin/campuses"
                className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}>
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
