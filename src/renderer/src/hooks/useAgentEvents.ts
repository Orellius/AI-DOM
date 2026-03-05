import { useEffect } from 'react'
import { useAgentStore } from '../stores/agentStore'
import type { AgentEvent } from '../stores/agentStore'

export function useAgentEvents(): void {
  const handleEvent = useAgentStore((s) => s.handleEvent)

  useEffect(() => {
    console.log('[VIBE:Events] useAgentEvents listener registered')
    const cleanup = window.api.onAgentEvent((event: AgentEvent) => {
      console.log('[VIBE:Events] received event from main:', event.type)
      handleEvent(event)
    })
    return cleanup
  }, [handleEvent])
}
