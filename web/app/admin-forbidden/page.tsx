export default function AdminForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F2E7' }}>
      <div className="text-center px-6 max-w-md">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
          style={{ backgroundColor: '#fde8e8' }}
        >
          <svg
            className="w-8 h-8"
            style={{ color: '#C0392B' }}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: '#20241F' }}>
          Access Denied
        </h1>
        <p className="text-base mb-6" style={{ color: '#8C8776' }}>
          Your account does not have admin privileges. Contact the Rihdal team if you believe this is an error.
        </p>
        <a
          href="/login"
          className="inline-block rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#1F3D2B', color: '#F7F2E7' }}
        >
          Back to login
        </a>
      </div>
    </div>
  )
}
