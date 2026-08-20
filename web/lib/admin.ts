import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'

export interface AdminUser {
  id: string
  email: string
  name: string | null
}

/**
 * Server-side admin guard. Call at the top of every admin page and action.
 * Verifies: (1) user is authenticated, (2) profiles.is_admin = true.
 * Redirects to /login if unauthenticated, redirects to /admin-forbidden if not admin.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login?redirect=/admin')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('name, is_admin')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.is_admin) {
    redirect('/admin-forbidden')
  }

  return { id: user.id, email: user.email!, name: profile.name }
}
