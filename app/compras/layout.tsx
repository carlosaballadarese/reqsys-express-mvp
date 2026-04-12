export const dynamic = 'force-dynamic'

import ComprasNav from '@/components/ComprasNav'

export default function ComprasLayout({ children }: { children: React.ReactNode }) {
  return <ComprasNav>{children}</ComprasNav>
}
