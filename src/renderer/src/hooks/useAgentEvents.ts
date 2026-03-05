import { useEffect } from 'react'
import { useAgentStore } from '../stores/agentStore'
import type { AgentEvent } from '../stores/agentStore'

export function useAgentEvents(): void {
  const handleEvent = useAgentStore((s) => s.handleEvent)

  useEffect(() => {
    const cleanup = window.api.onAgentEvent((event: AgentEvent) => {
      handleEvent(event)
    })
    return cleanup
  }, [handleEvent])
}
