'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'

export async function updateMosque(id: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const iqamaTimesRaw = formData.get('iqama_times') as string
  let iqama_times: Record<string, unknown> | null = null
  if (iqamaTimesRaw) {
    try {
      iqama_times = JSON.parse(iqamaTimesRaw)
    } catch {
      redirect(`/admin/mosques/${id}?error=${encodeURIComponent('Invalid JSON in iqama times')}`)
    }
  }

  const updates = {
    name: formData.get('name') as string,
    address: formData.get('address') as string || null,
    lat: formData.get('lat') ? parseFloat(formData.get('lat') as string) : null,
    lng: formData.get('lng') ? parseFloat(formData.get('lng') as string) : null,
    description: formData.get('description') as string || null,
    contact_phone: formData.get('contact_phone') as string || null,
    contact_email: formData.get('contact_email') as string || null,
    website: formData.get('website') as string || null,
    iqama_times,
  }

  const { error } = await supabase.from('mosques').update(updates).eq('id', id)

  if (error) {
    redirect(`/admin/mosques/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/mosques')
  revalidatePath(`/admin/mosques/${id}`)
  redirect(`/admin/mosques/${id}?success=1`)
}

export async function deleteMosque(id: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase.from('mosques').delete().eq('id', id)

  if (error) {
    redirect(`/admin/mosques/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/mosques')
  redirect('/admin/mosques')
}
