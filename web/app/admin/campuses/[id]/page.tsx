import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { updateUniversity, updateMsa, createMsa, deleteUniversity } from './actions'
import { PageHeader } from '@/components/admin/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}

export default async function CampusDetailPage({ params, searchParams }: Props) {
  await requireAdmin()
  const supabase = await createClient()

  const { id } = await params
  const sp = await searchParams

  const { data: university } = await supabase
    .from('universities')
    .select('*')
    .eq('id', id)
    .single()

  if (!university) notFound()

  const { data: msa } = await supabase
    .from('msas')
    .select('*')
    .eq('university_id', id)
    .maybeSingle()

  const updateUniversityWithId = updateUniversity.bind(null, id)
  const updateMsaWithId = msa ? updateMsa.bind(null, msa.id, id) : null
  const createMsaWithId = createMsa.bind(null, id)
  const deleteUniversityWithId = deleteUniversity.bind(null, id)

  return (
    <div>
      <PageHeader title={university.name} subtitle={[university.city, university.state].filter(Boolean).join(', ') || undefined} />

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

      <div className="space-y-6">
        {/* University form */}
        <div className="rounded-lg p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
          <h2 className="text-base font-semibold mb-5" style={{ color: '#20241F' }}>University Details</h2>
          <form action={updateUniversityWithId} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Name *</label>
                <input name="name" defaultValue={university.name} required
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Slug *</label>
                <input name="slug" defaultValue={university.slug} required
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Website</label>
                <input name="website" type="url" defaultValue={university.website ?? ''}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>City</label>
                <input name="city" defaultValue={university.city ?? ''}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>State</label>
                <input name="state" defaultValue={university.state ?? ''}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Country</label>
                <input name="country" defaultValue={university.country ?? 'US'}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium" style={{ color: '#20241F' }}>Verified</label>
                <select name="is_verified" defaultValue={String(university.is_verified)}
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}>
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Latitude</label>
                <input name="lat" type="number" step="any" defaultValue={university.lat ?? ''}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Longitude</label>
                <input name="lng" type="number" step="any" defaultValue={university.lng ?? ''}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: '#245737', color: '#ffffff' }}>
                Save University
              </button>
            </div>
          </form>
        </div>

        {/* MSA form */}
        <div className="rounded-lg p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
          <h2 className="text-base font-semibold mb-1" style={{ color: '#20241F' }}>MSA Details</h2>
          {!msa && (
            <p className="text-sm mb-5" style={{ color: '#8C8776' }}>
              No MSA exists for this university yet. Create one below.
            </p>
          )}
          {msa && (
            <p className="text-sm mb-5" style={{ color: '#8C8776' }}>
              MSA ID: <span className="font-mono text-xs">{msa.id}</span>
            </p>
          )}
          <form action={msa && updateMsaWithId ? updateMsaWithId : createMsaWithId} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>MSA Name *</label>
                <input name="msa_name" defaultValue={msa?.name ?? ''} required
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="Muslim Student Association" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Description</label>
                <textarea name="msa_description" defaultValue={msa?.description ?? ''} rows={3}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Email</label>
                <input name="msa_email" type="email" defaultValue={msa?.email ?? ''}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Website</label>
                <input name="msa_website" type="url" defaultValue={msa?.website ?? ''}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Instagram Handle</label>
                <input name="msa_instagram_handle" defaultValue={msa?.instagram_handle ?? ''}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="@msahandle" />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium" style={{ color: '#20241F' }}>Verified</label>
                <select name="msa_is_verified" defaultValue={String(msa?.is_verified ?? false)}
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
                {msa ? 'Save MSA' : 'Create MSA'}
              </button>
            </div>
          </form>
        </div>

        {/* Danger zone */}
        <div className="rounded-lg p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #FECACA' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#C0392B' }}>Danger Zone</h3>
          <details>
            <summary className="text-sm cursor-pointer font-medium" style={{ color: '#C0392B' }}>
              Delete this university
            </summary>
            <div className="mt-3">
              <p className="text-xs mb-3" style={{ color: '#8C8776' }}>
                Permanently deletes the university and all associated MSAs, members, events, announcements, and campus data.
              </p>
              <form action={deleteUniversityWithId}>
                <button type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{ backgroundColor: '#C0392B', color: '#ffffff' }}>
                  Confirm Delete
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
