import { loginAction } from './actions'

interface Props {
  searchParams: Promise<{ error?: string; redirect?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const error = params.error
  const redirectTo = params.redirect || '/admin'

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1F3D2B' }}>
      <div className="w-full max-w-sm px-6">
        {/* Logo / Wordmark */}
        <div className="text-center mb-8">
          <h1
            className="text-4xl font-bold tracking-widest uppercase"
            style={{ color: '#F7F2E7', letterSpacing: '0.2em' }}
          >
            Rihdal
          </h1>
          <p className="mt-1 text-sm font-medium uppercase tracking-widest" style={{ color: '#B08D57' }}>
            Admin Portal
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-xl p-8 shadow-xl"
          style={{ backgroundColor: '#F7F2E7', border: '1px solid #EAE3D3' }}
        >
          <h2 className="text-lg font-semibold mb-6" style={{ color: '#20241F' }}>
            Sign in to your account
          </h2>

          {error && (
            <div
              className="mb-4 rounded-lg px-4 py-3 text-sm"
              style={{ backgroundColor: '#fde8e8', color: '#C0392B', border: '1px solid #f5c6cb' }}
            >
              {decodeURIComponent(error)}
            </div>
          )}

          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="redirect" value={redirectTo} />

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1"
                style={{ color: '#20241F' }}
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                style={{
                  border: '1px solid #EAE3D3',
                  backgroundColor: '#ffffff',
                  color: '#20241F',
                }}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1"
                style={{ color: '#20241F' }}
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                style={{
                  border: '1px solid #EAE3D3',
                  backgroundColor: '#ffffff',
                  color: '#20241F',
                }}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 mt-2"
              style={{ backgroundColor: '#F7F2E7', color: '#1F3D2B', border: '2px solid #1F3D2B' }}
            >
              Sign in
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: '#B08D57', opacity: 0.7 }}>
          Access restricted to Rihdal administrators
        </p>
      </div>
    </div>
  )
}
