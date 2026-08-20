'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'

// ─── Submissions ────────────────────────────────────────────────

export async function approveSubmission(id: string) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  // Fetch the submission
  const { data: submission, error: fetchError } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !submission) {
    redirect(`/admin/claims?error=${encodeURIComponent('Submission not found')}`)
  }

  // Create the restaurant record from the submission
  const { data: restaurant, error: createError } = await supabase
    .from('restaurants')
    .insert({
      name: submission.name,
      address: submission.address,
      lat: submission.lat ?? null,
      lng: submission.lng ?? null,
      cuisine_type: submission.cuisine_type ?? null,
      phone: submission.phone ?? null,
      website: submission.website ?? null,
      submitted_by: submission.user_id,
      is_verified: false,
      status: 'approved',
      image_url: (submission.restaurant_photo_urls as string[] | null)?.[0] ?? null,
    })
    .select('id')
    .single()

  if (createError) {
    redirect(`/admin/claims?error=${encodeURIComponent(createError.message)}`)
  }

  // Update the submission status and link to the created restaurant
  const { error: updateError } = await supabase
    .from('submissions')
    .update({
      status: 'approved',
      restaurant_id: restaurant.id,
      reviewer_notes: `Approved by admin ${admin.email}`,
    })
    .eq('id', id)

  if (updateError) {
    redirect(`/admin/claims?error=${encodeURIComponent(updateError.message)}`)
  }

  revalidatePath('/admin/claims')
  revalidatePath('/admin/businesses')
  redirect('/admin/claims?success=1')
}

export async function rejectSubmission(id: string, formData: FormData) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  const reason = formData.get('reason') as string || 'No reason provided'

  const { error } = await supabase
    .from('submissions')
    .update({
      status: 'rejected',
      reviewer_notes: `Rejected by admin ${admin.email}: ${reason}`,
    })
    .eq('id', id)

  if (error) {
    redirect(`/admin/claims?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/claims')
  redirect('/admin/claims?success=1')
}

// ─── Restaurant Claims ───────────────────────────────────────────

export async function approveClaim(id: string) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  // Fetch the claim
  const { data: claim, error: fetchError } = await supabase
    .from('restaurant_claims')
    .select('restaurant_id, user_id')
    .eq('id', id)
    .single()

  if (fetchError || !claim) {
    redirect(`/admin/claims?error=${encodeURIComponent('Claim not found')}`)
  }

  // Update the restaurant's owner
  const { error: ownerError } = await supabase
    .from('restaurants')
    .update({ owner_id: claim.user_id })
    .eq('id', claim.restaurant_id)

  if (ownerError) {
    redirect(`/admin/claims?error=${encodeURIComponent(ownerError.message)}`)
  }

  // Mark claim as approved
  const { error: claimError } = await supabase
    .from('restaurant_claims')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', id)

  if (claimError) {
    redirect(`/admin/claims?error=${encodeURIComponent(claimError.message)}`)
  }

  revalidatePath('/admin/claims')
  revalidatePath('/admin/businesses')
  redirect('/admin/claims?success=1')
}

export async function rejectClaim(id: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const reason = formData.get('reason') as string || 'No reason provided'

  const { error } = await supabase
    .from('restaurant_claims')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    redirect(`/admin/claims?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/claims')
  redirect('/admin/claims?success=1')
}

// ─── MSA Onboarding Requests ─────────────────────────────────────

export async function approveMsaRequest(id: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('msa_onboarding_requests')
    .update({ status: 'approved' })
    .eq('id', id)

  if (error) {
    redirect(`/admin/claims?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/claims')
  revalidatePath('/admin/campuses')
  redirect('/admin/claims?success=1')
}

export async function rejectMsaRequest(id: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const reason = formData.get('reason') as string || 'No reason provided'

  const { error } = await supabase
    .from('msa_onboarding_requests')
    .update({ status: 'rejected' })
    .eq('id', id)

  if (error) {
    redirect(`/admin/claims?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/claims')
  redirect('/admin/claims?success=1')
}
