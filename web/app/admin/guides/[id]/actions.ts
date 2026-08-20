'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'

export async function updateGuide(id: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const tagsRaw = formData.get('tags') as string
  const tags = tagsRaw
    ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
    : []

  const updates = {
    title: formData.get('title') as string,
    subtitle: formData.get('subtitle') as string || null,
    category: formData.get('category') as string,
    tags,
    is_featured: formData.get('is_featured') === 'true',
    is_published: formData.get('is_published') === 'true',
    position: parseInt(formData.get('position') as string || '0', 10),
    cover_image_url: formData.get('cover_image_url') as string || null,
  }

  const { error } = await supabase.from('guides').update(updates).eq('id', id)

  if (error) {
    redirect(`/admin/guides/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/guides')
  revalidatePath(`/admin/guides/${id}`)
  redirect(`/admin/guides/${id}?success=1`)
}

export async function removeGuideItem(guideId: string, itemId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase.from('guide_items').delete().eq('id', itemId)

  if (error) {
    redirect(`/admin/guides/${guideId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/guides/${guideId}`)
  redirect(`/admin/guides/${guideId}?success=1`)
}

export async function addGuideItem(guideId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const restaurantId = formData.get('restaurant_id') as string
  if (!restaurantId) {
    redirect(`/admin/guides/${guideId}?error=${encodeURIComponent('Restaurant ID is required')}`)
  }

  const record = {
    guide_id: guideId,
    restaurant_id: restaurantId,
    position: parseInt(formData.get('position') as string || '0', 10),
    curator_note: formData.get('curator_note') as string || null,
  }

  const { error } = await supabase.from('guide_items').insert(record)

  if (error) {
    redirect(`/admin/guides/${guideId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/guides/${guideId}`)
  redirect(`/admin/guides/${guideId}?success=1`)
}

export async function deleteGuide(id: string) {
  await requireAdmin()
  const supabase = await createClient()

  // Cascades to guide_items and saved_guides
  const { error } = await supabase.from('guides').delete().eq('id', id)

  if (error) {
    redirect(`/admin/guides/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/guides')
  redirect('/admin/guides')
}
