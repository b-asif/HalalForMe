'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'

export async function updateBusiness(id: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const updates = {
    name: formData.get('name') as string,
    address: formData.get('address') as string,
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

  const { error } = await supabase
    .from('restaurants')
    .update(updates)
    .eq('id', id)

  if (error) {
    redirect(`/admin/businesses/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/businesses')
  revalidatePath(`/admin/businesses/${id}`)
  redirect(`/admin/businesses/${id}?success=1`)
}

export async function verifyBusiness(id: string, verified: boolean) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('restaurants')
    .update({ is_verified: verified })
    .eq('id', id)

  if (error) {
    redirect(`/admin/businesses/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/businesses')
  revalidatePath(`/admin/businesses/${id}`)
  redirect(`/admin/businesses/${id}?success=1`)
}

export async function deleteBusiness(id: string) {
  await requireAdmin()
  const supabase = await createClient()

  // Note: deleting a restaurant will cascade-delete associated data:
  // reviews, saved_restaurants, restaurant_claims, restaurant_photos,
  // menu_photos, guide_items, contribution_points (via trigger references).
  const { error } = await supabase
    .from('restaurants')
    .delete()
    .eq('id', id)

  if (error) {
    redirect(`/admin/businesses/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/businesses')
  redirect('/admin/businesses')
}
