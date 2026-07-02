/**
 * Maps raw Supabase / network errors to friendly user-facing messages.
 * Import this everywhere instead of surfacing err.message directly.
 */
export function formatError(err: unknown): string {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : '';

  if (!msg) return 'Something went wrong. Please try again.';

  // Auth errors
  if (/invalid login credentials/i.test(msg))   return 'Incorrect email or password.';
  if (/email not confirmed/i.test(msg))          return 'Please verify your email before signing in.';
  if (/user already registered/i.test(msg))      return 'An account with this email already exists.';
  if (/password.{0,20}too short/i.test(msg))     return 'Password must be at least 6 characters.';
  if (/jwt expired/i.test(msg))                  return 'Your session has expired. Please sign in again.';

  // Database / schema errors — never expose these internals
  if (/relation .+ does not exist/i.test(msg))   return 'Service temporarily unavailable. Please try again later.';
  if (/column .+ does not exist/i.test(msg))     return 'Service temporarily unavailable. Please try again later.';
  if (/row.level security/i.test(msg))           return "You don't have permission to do that.";
  if (/permission denied/i.test(msg))            return "You don't have permission to do that.";
  if (/violates .+ constraint/i.test(msg))       return 'This conflicts with existing data. Please refresh and try again.';

  // Network / timeout errors
  if (/network request failed/i.test(msg))       return 'No internet connection. Check your network and try again.';
  if (/timed?\s*out|abort/i.test(msg))           return 'The request timed out. Please try again.';

  // Storage errors
  if (/storage|upload/i.test(msg))               return 'File upload failed. Please try again.';

  // Generic fallback — never leak raw Supabase/PostgREST messages
  return 'Something went wrong. Please try again.';
}

/**
 * Wraps a fetch call with an AbortController timeout.
 * Throws a timeout error if the request exceeds `ms` milliseconds.
 */
export async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  ms = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error('Request timed out. Please try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
