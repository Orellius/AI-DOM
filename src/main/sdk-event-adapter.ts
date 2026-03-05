import type { AgentEvent } from './orchestrator'

// SDK message types (from @anthropic-ai/claude-agent-sdk)
// We use structural typing to avoid tight coupling to SDK internals
interface SDKMessageBase {
  type: string
  session_id?: string
  uuid?: string
}

interface SDKSystemMsg extends SDKMessageBase {
  type: 'system'
  subtype: 'init'
  session_id: string
}

interface SDKAssistantMsg extends SDKMessageBase {
  type: 'assistant'
  message: {
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    >
  }
}

interface SDKResultMsg extends SDKMessageBase {
  type: 'result'
  subtype: 'success' | string
  result?: string
  total_cost_usd?: number
  num_turns?: number
  session_id: string
  errors?: string[]
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  modelUsage?: Record<string, {
    inputTokens: number
    outputTokens: number
    contextWindow: number
    costUSD: number
  }>
}

type SDKMsg = SDKSystemMsg | SDKAssistantMsg | SDKResultMsg | SDKMessageBase

/**
 * Translate an SDK message from a chat query into AgentEvent(s) for the renderer.
 * Returns an array because one SDK message may produce multiple events
 * (e.g. an assistant message with both text and tool_use blocks).
 */
export function adaptChatMessage(msg: unknown): AgentEvent[] {
  const m = msg as SDKMsg
  const events: AgentEvent[] = []

  switch (m.type) {
    case 'system': {
      const sys = m as SDKSystemMsg
      if (sys.subtype === 'init' && sys.session_id) {
        events.push({ type: 'chat:session', sessionId: sys.session_id })
      }
      break
    }

    case 'assistant': {
      const asst = m as SDKAssistantMsg
      for (const block of asst.message.content) {
        if (block.type === 'text' && block.text) {
          events.push({ type: 'chat:text', content: block.text })
        }
        if (block.type === 'tool_use' && block.name) {
          events.push({
            type: 'chat:tool-use',
            name: block.name,
            input: JSON.stringify(block.input ?? {}, null, 2)
          })
        }
      }
      break
    }

    case 'result': {
      const res = m as SDKResultMsg
      if (res.subtype === 'success') {
        if (typeof res.total_cost_usd === 'number') {
          // Derive model + contextWindow from modelUsage (first key = primary model)
          const modelEntries = res.modelUsage ? Object.entries(res.modelUsage) : []
          const primaryModel = modelEntries.length > 0 ? modelEntries[0][0] : ''
          const primaryEntry = modelEntries.length > 0 ? modelEntries[0][1] : null
          const contextWindow = primaryEntry?.contextWindow ?? 0

          events.push({
            type: 'chat:cost',
            costUsd: res.total_cost_usd,
            turns: res.num_turns ?? 0,
            inputTokens: res.usage?.input_tokens ?? 0,
            outputTokens: res.usage?.output_tokens ?? 0,
            cacheReadTokens: res.usage?.cache_read_input_tokens ?? 0,
            cacheCreationTokens: res.usage?.cache_creation_input_tokens ?? 0,
            contextWindow,
            model: primaryModel,
          })
        }
        events.push({ type: 'chat:done' })
      } else {
        const errMsg = res.errors?.join('; ') || `Query ended: ${res.subtype}`
        events.push({ type: 'chat:error', error: errMsg })
      }
      break
    }
  }

  return events
}

/**
 * Translate an SDK message from a worker query into AgentEvent(s).
 */
export function adaptWorkerMessage(taskId: string, msg: unknown): AgentEvent[] {
  const m = msg as SDKMsg
  const events: AgentEvent[] = []

  switch (m.type) {
    case 'assistant': {
      const asst = m as SDKAssistantMsg
      for (const block of asst.message.content) {
        if (block.type === 'text' && block.text) {
          events.push({ type: 'task:progress', taskId, content: block.text })
        }
        if (block.type === 'tool_use' && block.name) {
          events.push({ type: 'task:progress', taskId, content: '', toolInUse: block.name })
        }
      }
      break
    }

    case 'result': {
      const res = m as SDKResultMsg
      // task:completed and task:failed are emitted by SessionManager
      // after the for-await loop finishes — we only emit progress here
      break
    }
  }

  return events
}
