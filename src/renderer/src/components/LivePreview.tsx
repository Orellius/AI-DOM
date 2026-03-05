import { MonitorPlay } from 'lucide-react'

export function LivePreview(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#2a2a2a] px-10 py-8">
        <MonitorPlay className="h-6 w-6 text-[#333]" />
        <p className="text-xs font-medium text-[#555]">Live Preview</p>
        <p className="text-[10px] text-[#444]">Output will appear here</p>
      </div>
    </div>
  )
}
