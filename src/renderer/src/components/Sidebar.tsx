import { UmbrellaSync } from './UmbrellaSync'

export function Sidebar(): JSX.Element {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <UmbrellaSync />
    </div>
  )
}
