import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { updateGuide, removeGuideItem, addGuideItem, deleteGuide } from './actions'
import { PageHeader } from '@/components/admin/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}

export default async function GuideDetailPage({ params, searchParams }: Props) {
  await requireAdmin()
  const supabase = await createClient()

  const { id } = await params
  const sp = await searchParams

  const { data: guide } = await supabase
    .from('guides')
    .select('*')
    .eq('id', id)
    .single()

  if (!guide) notFound()

  const { data: items } = await supabase
    .from('guide_items')
    .select('id, position, curator_note, restaurant_id, restaurants(id, name)')
    .eq('guide_id', id)
    .order('position', { ascending: true })

  const updateGuideWithId = updateGuide.bind(null, id)
  const addGuideItemWithId = addGuideItem.bind(null, id)
  const deleteGuideWithId = deleteGuide.bind(null, id)

  return (
    <div>
      <PageHeader title={guide.title} subtitle={guide.subtitle ?? undefined} />

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
        <div className="lg:col-span-2 space-y-6">
          {/* Guide edit form */}
          <div className="rounded-lg p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
            <h2 className="text-base font-semibold mb-5" style={{ color: '#20241F' }}>Edit Guide</h2>
            <form action={updateGuideWithId} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Title *</label>
                <input name="title" defaultValue={guide.title} required
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Subtitle</label>
                <input name="subtitle" defaultValue={guide.subtitle ?? ''}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Category *</label>
                  <select name="category" defaultValue={guide.category}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}>
                    <option value="campus">Campus</option>
                    <option value="cafe">Cafe</option>
                    <option value="food">Food</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Position</label>
                  <input name="position" type="number" defaultValue={guide.position}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium" style={{ color: '#20241F' }}>Featured</label>
                  <select name="is_featured" defaultValue={String(guide.is_featured)}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium" style={{ color: '#20241F' }}>Published</label>
                  <select name="is_published" defaultValue={String(guide.is_published)}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>
                  Tags
                  <span className="ml-1 text-xs font-normal" style={{ color: '#8C8776' }}>(comma-separated)</span>
                </label>
                <input name="tags" defaultValue={(guide.tags as string[] ?? []).join(', ')}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="halal, downtown, student-friendly" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#20241F' }}>Cover Image URL</label>
                <input name="cover_image_url" type="url" defaultValue={guide.cover_image_url ?? ''}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="rounded-lg px-4 py-2 text-sm font-semibold"
                  style={{ backgroundColor: '#245737', color: '#ffffff' }}>
                  Save changes
                </button>
              </div>
            </form>
          </div>

          {/* Guide items */}
          <div className="rounded-lg p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
            <h2 className="text-base font-semibold mb-5" style={{ color: '#20241F' }}>
              Guide Items ({(items ?? []).length})
            </h2>

            {(items ?? []).length === 0 ? (
              <p className="text-sm" style={{ color: '#8C8776' }}>No items in this guide yet.</p>
            ) : (
              <ul className="space-y-2 mb-6">
                {(items ?? []).map((item) => {
                  const restaurant = Array.isArray(item.restaurants) ? item.restaurants[0] : item.restaurants
                  const removeAction = removeGuideItem.bind(null, id, item.id)
                  return (
                    <li key={item.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2"
                      style={{ backgroundColor: '#F7F2E7', border: '1px solid #EAE3D3' }}>
                      <div>
                        <span className="text-sm font-medium" style={{ color: '#20241F' }}>
                          #{item.position} — {restaurant?.name ?? item.restaurant_id}
                        </span>
                        {item.curator_note && (
                          <p className="text-xs mt-0.5" style={{ color: '#8C8776' }}>{item.curator_note}</p>
                        )}
                      </div>
                      <form action={removeAction}>
                        <button type="submit"
                          className="text-xs rounded-lg px-2 py-1 font-medium"
                          style={{ backgroundColor: '#FEE2E2', color: '#C0392B' }}>
                          Remove
                        </button>
                      </form>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Add item */}
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#20241F' }}>Add Item</h3>
            <form action={addGuideItemWithId} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#8C8776' }}>Restaurant ID *</label>
                <input name="restaurant_id" required
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono"
                  style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                  placeholder="uuid of the restaurant" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#8C8776' }}>Position</label>
                  <input name="position" type="number" defaultValue={(items ?? []).length}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#8C8776' }}>Curator Note</label>
                  <input name="curator_note"
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #EAE3D3', backgroundColor: '#ffffff', color: '#20241F' }}
                    placeholder="Optional note" />
                </div>
              </div>
              <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium"
                style={{ backgroundColor: '#245737', color: '#ffffff' }}>
                Add to guide
              </button>
            </form>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-lg p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #EAE3D3' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#20241F' }}>Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: '#8C8776' }}>Published</span>
                <StatusBadge status={guide.is_published ? 'published' : 'unpublished'} />
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#8C8776' }}>Featured</span>
                <StatusBadge status={guide.is_featured ? 'verified' : 'draft'} />
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#8C8776' }}>Category</span>
                <span className="capitalize" style={{ color: '#20241F' }}>{guide.category}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#8C8776' }}>Position</span>
                <span style={{ color: '#20241F' }}>{guide.position}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#8C8776' }}>Items</span>
                <span style={{ color: '#20241F' }}>{(items ?? []).length}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#8C8776' }}>Created</span>
                <span style={{ color: '#20241F' }}>{new Date(guide.created_at as string).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #FECACA' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#C0392B' }}>Danger Zone</h3>
            <details>
              <summary className="text-sm cursor-pointer font-medium" style={{ color: '#C0392B' }}>
                Delete this guide
              </summary>
              <div className="mt-3">
                <p className="text-xs mb-3" style={{ color: '#8C8776' }}>
                  Permanently deletes the guide and removes all items from it.
                </p>
                <form action={deleteGuideWithId}>
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
    </div>
  )
}
