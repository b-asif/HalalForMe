interface StatusBadgeProps {
  status: string
}

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  pending:     { bg: '#FEF3C7', text: '#B7791F', label: 'Pending' },
  approved:    { bg: '#D1FAE5', text: '#245737', label: 'Approved' },
  rejected:    { bg: '#FEE2E2', text: '#C0392B', label: 'Rejected' },
  active:      { bg: '#D1FAE5', text: '#245737', label: 'Active' },
  verified:    { bg: '#D1FAE5', text: '#1F3D2B', label: 'Verified' },
  published:   { bg: '#D1FAE5', text: '#245737', label: 'Published' },
  unpublished: { bg: '#F3F4F6', text: '#6B7280', label: 'Unpublished' },
  draft:       { bg: '#F3F4F6', text: '#6B7280', label: 'Draft' },
  dismissed:   { bg: '#F3F4F6', text: '#6B7280', label: 'Dismissed' },
  reviewed:    { bg: '#E0E7FF', text: '#3730A3', label: 'Reviewed' },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status.toLowerCase()] ?? {
    bg: '#F3F4F6',
    text: '#6B7280',
    label: status,
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  )
}
