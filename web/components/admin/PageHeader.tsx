interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: {
    label: string
    href: string
  }
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#20241F' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm" style={{ color: '#8C8776' }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <a
          href={action.href}
          className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#245737', color: '#ffffff' }}
        >
          {action.label}
        </a>
      )}
    </div>
  )
}
