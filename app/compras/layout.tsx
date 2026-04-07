export const dynamic = 'force-dynamic'

import ComprasNav from './ComprasNav'

export default function ComprasLayout({ children }: { children: React.ReactNode }) {
  return <ComprasNav>{children}</ComprasNav>
}
