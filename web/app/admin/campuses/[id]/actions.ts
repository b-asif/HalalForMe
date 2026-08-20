'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'

export async function updateUniversity(id: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const updates = {
    name: formData.get('name') as string,
    slug: formData.get('slug') as string,
    city: formData.get('city') as string || null,
    state: formData.get('state') as string || null,
    country: formData.get('country') as string || 'US',
    lat: formData.get('lat') ? parseFloat(formData.get('lat') as string) : null,
    lng: formData.get('lng') ? parseFloat(formData.get('lng') as string) : null,
    website: formData.get('website') as string || null,
    is_verified: formData.get('is_verified') === 'true',
  }

  const { error } = await supabase.from('universities').update(updates).eq('id', id)

  if (error) {
    redirect(`/admin/campuses/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/campuses')
  revalidatePath(`/admin/campuses/${id}`)
  redirect(`/admin/campuses/${id}?success=1`)
}

export async function updateMsa(msaId: string, universityId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const updates = {
    name: formData.get('msa_name') as string,
    description: formData.get('msa_description') as string || null,
    email: formData.get('msa_email') as string || null,
    website: formData.get('msa_website') as string || null,
    instagram_handle: formData.get('msa_instagram_handle') as string || null,
    is_verified: formData.get('msa_is_verified') === 'true',
  }

  const { error } = await supabase.from('msas').update(updates).eq('id', msaId)

  if (error) {
    redirect(`/admin/campuses/${universityId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/campuses')
  revalidatePath(`/admin/campuses/${universityId}`)
  redirect(`/admin/campuses/${universityId}?success=1`)
}

export async function createMsa(universityId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const record = {
    university_id: universityId,
    name: formData.get('msa_name') as string,
    description: formData.get('msa_description') as string || null,
    email: formData.get('msa_email') as string || null,
    website: formData.get('msa_website') as string || null,
    instagram_handle: formData.get('msa_instagram_handle') as string || null,
    is_verified: formData.get('msa_is_verified') === 'true',
  }

  const { error } = await supabase.from('msas').insert(record)

  if (error) {
    redirect(`/admin/campuses/${universityId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/campuses')
  revalidatePath(`/admin/campuses/${universityId}`)
  redirect(`/admin/campuses/${universityId}?success=1`)
}

export async function deleteUniversity(id: string) {
  await requireAdmin()
  const supabase = await createClient()

  // Cascades to msas, msa_members, campus_* tables
  const { error } = await supabase.from('universities').delete().eq('id', id)

  if (error) {
    redirect(`/admin/campuses/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/campuses')
  redirect('/admin/campuses')
}
