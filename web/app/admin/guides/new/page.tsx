import { requireAdmin } from '@/lib/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/admin/PageHeader'

async function createGuide(formData: FormData) {
  'use server'
  await requireAdmin()
  const supabase = await createClient()

  const tagsRaw = formData.get('tags') as string
  const tags = tagsRaw
    ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
    : []

  const record = {
    title: formData.get('title') as string,
    subtitle: formData.get('subtitle') as string || null,
    category: formData.get('category') as string,
    tags,
    is_featured: formData.get('is_featured') === 'true',
    is_published: formData.get('is_published') === 'true',
    position: parseInt(formData.get('position') as string || '0', 10),
    cover_image_url: formData.get('cover_image_url') as string || null,
  }

  const { data, error } = await supabase.from('guides').insert(record).select('id').single()

  if (error) {
    redirect(`/admin/guides/new?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/guides')
  redirect(`/admin/guides/${data.id}?success=1`)
}

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function NewGuidePage({ searchParams }: Props) {
  await requireAdmin()
  const sp = await searchParams

  return (
    <div>
      <PageHeader title="New Guide" subtitle="Create a curated collection" />

      {sp.error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#FEE2E2', color: '#C0392B', border: '1px solid #FECACA' }}>
          Error: {decodeURIComponent(sp.error)}
        </div>
      )}

      <div className="max-w-2xl">
        <div className="rounded-lg p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
          <form action={createGuide} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Title *</label>
              <input name="title" required
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                placeholder="Best Halal Spots Near Campus" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Subtitle</label>
              <input name="subtitle"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                placeholder="A short description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Category *</label>
                <select name="category" defaultValue="food"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}>
                  <option value="campus">Campus</option>
                  <option value="cafe">Cafe</option>
                  <option value="food">Food</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Position</label>
                <input name="position" type="number" defaultValue={0}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium" style={{ color: '#20241F' }}>Featured</label>
                <select name="is_featured" defaultValue="false"
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}>
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium" style={{ color: '#20241F' }}>Published</label>
                <select name="is_published" defaultValue="true"
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>
                Tags
                <span className="ml-1 text-xs font-normal" style={{ color: '#8C8776' }}>(comma-separated)</span>
              </label>
              <input name="tags"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                placeholder="halal, student, downtown" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Cover Image URL</label>
              <input name="cover_image_url" type="url"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: '#245737', color: '#ffffff' }}>
                Create Guide
              </button>
              <a href="/admin/guides"
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
