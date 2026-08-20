import { requireAdmin } from '@/lib/admin'
import { Sidebar } from '@/components/admin/Sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#F7F2E7' }}>
      {/* Fixed sidebar */}
      <div className="fixed top-0 left-0 h-screen z-40" style={{ width: '240px' }}>
        <Sidebar adminName={admin.name} adminEmail={admin.email} />
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-auto" style={{ marginLeft: '240px', minHeight: '100vh' }}>
        <main className="p-8">{children}</main>
      </div>
    </div>
  )
}
