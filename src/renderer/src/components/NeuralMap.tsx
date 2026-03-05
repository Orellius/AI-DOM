import { useMemo } from 'react'
import { ReactFlow, Background, BackgroundVariant, ReactFlowProvider, type NodeTypes } from '@xyflow/react'
import { useAgentStore } from '../stores/agentStore'
import { NeuralNode } from './NeuralNode'

const nodeTypes: NodeTypes = { task: NeuralNode }

function NeuralMapInner(): JSX.Element {
  const getNodes = useAgentStore((s) => s.getNodes)
  const getEdges = useAgentStore((s) => s.getEdges)
  const tasks = useAgentStore((s) => s.tasks)

  const nodes = useMemo(() => getNodes(), [tasks, getNodes])
  const edges = useMemo(() => getEdges(), [tasks, getEdges])

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-[#444]">Submit an intent to begin</p>
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      colorMode="dark"
      fitView
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
    >
      <Background color="#1c1c1c" variant={BackgroundVariant.Dots} />
    </ReactFlow>
  )
}

export function NeuralMap(): JSX.Element {
  return (
    <ReactFlowProvider>
      <NeuralMapInner />
    </ReactFlowProvider>
  )
}
