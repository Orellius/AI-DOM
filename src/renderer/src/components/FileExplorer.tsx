import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Folder, FolderOpen, FileCode2, FileText, FileJson, Image, File,
  ChevronRight, Plus, Trash2, Edit3, FolderPlus,
} from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'
import type { FileEntry } from '../../../preload/index.d'

const EMPTY_TREES: Record<string, FileEntry[]> = {}

function getFileIcon(entry: FileEntry): { Icon: typeof File; color: string } {
  if (entry.isDirectory) return { Icon: Folder, color: 'var(--color-text-dim)' }
  const ext = entry.name.includes('.') ? '.' + entry.name.split('.').pop()!.toLowerCase() : ''
  switch (ext) {
    case '.ts': case '.tsx': return { Icon: FileCode2, color: '#00b4d8' }
    case '.js': case '.jsx': return { Icon: FileCode2, color: '#f0c040' }
    case '.json': return { Icon: FileJson, color: '#f0c040' }
    case '.md': case '.mdx': return { Icon: FileText, color: 'var(--color-text-dim)' }
    case '.png': case '.jpg': case '.jpeg': case '.gif': case '.svg': case '.webp':
      return { Icon: Image, color: '#a855f7' }
    default: return { Icon: File, color: 'var(--color-text-dim)' }
  }
}

interface ContextMenuState {
  x: number
  y: number
  entry: FileEntry
}

interface TreeNodeProps {
  entry: FileEntry
  depth: number
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void
}

function TreeNode({ entry, depth, onContextMenu }: TreeNodeProps): JSX.Element {
  const expandedDirs = useAgentStore(s => s.expandedDirs)
  const fileTree = useAgentStore(s => s.fileTree)
  const toggleDirectory = useAgentStore(s => s.toggleDirectory)
  const openFile = useAgentStore(s => s.openFile)
  const selectedFile = useAgentStore(s => s.selectedFile)

  const isExpanded = expandedDirs.includes(entry.relativePath)
  const children = fileTree[entry.relativePath] || []
  const isSelected = selectedFile?.relativePath === entry.relativePath
  const { Icon, color } = getFileIcon(entry)

  const handleClick = useCallback(() => {
    if (entry.isDirectory) {
      toggleDirectory(entry.relativePath)
    } else {
      openFile(entry.relativePath)
    }
  }, [entry, toggleDirectory, openFile])

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, entry)}
        className="flex items-center w-full text-left transition-colors rounded"
        style={{
          paddingLeft: `${depth * 16 + 4}px`,
          paddingRight: '4px',
          paddingTop: '2px',
          paddingBottom: '2px',
          fontSize: scaled(12),
          fontFamily: 'var(--font-mono)',
          color: isSelected ? 'var(--color-accent)' : 'var(--color-text)',
          background: isSelected ? 'rgba(0, 232, 157, 0.08)' : 'transparent',
          cursor: 'pointer',
          border: 'none',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.background = 'transparent'
        }}
      >
        {entry.isDirectory && (
          <ChevronRight
            size={12}
            style={{
              color: 'var(--color-text-dim)',
              flexShrink: 0,
              marginRight: '2px',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}
          />
        )}
        {!entry.isDirectory && <span style={{ width: '14px', flexShrink: 0 }} />}
        {entry.isDirectory ? (
          isExpanded ? (
            <FolderOpen size={14} style={{ color: 'var(--color-accent)', flexShrink: 0, marginRight: '4px' }} />
          ) : (
            <Folder size={14} style={{ color, flexShrink: 0, marginRight: '4px' }} />
          )
        ) : (
          <Icon size={14} style={{ color, flexShrink: 0, marginRight: '4px' }} />
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {entry.isDirectory && isExpanded && children.map(child => (
        <TreeNode
          key={child.relativePath}
          entry={child}
          depth={depth + 1}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  )
}

export function FileExplorer(): JSX.Element {
  const fileTree = useAgentStore(s => s.fileTree)
  const loadDirectory = useAgentStore(s => s.loadDirectory)
  const activeProject = useAgentStore(s => s.activeProject)
  const deleteFileEntry = useAgentStore(s => s.deleteFileEntry)
  const renameFileEntry = useAgentStore(s => s.renameFileEntry)
  const createFileEntry = useAgentStore(s => s.createFileEntry)
  const createDirectoryEntry = useAgentStore(s => s.createDirectoryEntry)

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [creating, setCreating] = useState<{ parentPath: string; type: 'file' | 'directory'; name: string } | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const createInputRef = useRef<HTMLInputElement>(null)

  // Load root on mount or project change
  useEffect(() => {
    if (activeProject) {
      loadDirectory('.')
    }
  }, [activeProject, loadDirectory])

  // Focus inputs when shown
  useEffect(() => {
    if (renaming) renameInputRef.current?.focus()
  }, [renaming])
  useEffect(() => {
    if (creating) createInputRef.current?.focus()
  }, [creating])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }, [])

  const handleRootContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      entry: { name: '.', path: '', relativePath: '.', isDirectory: true, size: 0, modifiedAt: 0 },
    })
  }, [])

  const handleRenameSubmit = useCallback(() => {
    if (!renaming || !renaming.name.trim()) {
      setRenaming(null)
      return
    }
    renameFileEntry(renaming.path, renaming.name.trim())
    setRenaming(null)
  }, [renaming, renameFileEntry])

  const handleCreateSubmit = useCallback(() => {
    if (!creating || !creating.name.trim()) {
      setCreating(null)
      return
    }
    const fullPath = creating.parentPath === '.' ? creating.name.trim() : `${creating.parentPath}/${creating.name.trim()}`
    if (creating.type === 'file') {
      createFileEntry(fullPath)
    } else {
      createDirectoryEntry(fullPath)
    }
    setCreating(null)
  }, [creating, createFileEntry, createDirectoryEntry])

  const rootEntries = fileTree['.'] || []

  return (
    <div
      className="flex flex-col h-full"
      onContextMenu={handleRootContextMenu}
    >
      <div className="flex-1 overflow-y-auto" style={{ paddingTop: '2px' }}>
        {rootEntries.length === 0 ? (
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(11),
            color: 'var(--color-text-dim)',
            padding: '4px',
          }}>
            No files
          </p>
        ) : (
          rootEntries.map(entry => (
            <TreeNode
              key={entry.relativePath}
              entry={entry}
              depth={0}
              onContextMenu={handleContextMenu}
            />
          ))
        )}

        {/* Inline create input */}
        {creating && (
          <div
            className="flex items-center gap-1"
            style={{
              padding: '2px 4px',
              marginLeft: '20px',
            }}
          >
            {creating.type === 'directory' ? (
              <FolderPlus size={12} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            ) : (
              <Plus size={12} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            )}
            <input
              ref={createInputRef}
              value={creating.name}
              onChange={(e) => setCreating({ ...creating, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSubmit()
                if (e.key === 'Escape') setCreating(null)
              }}
              onBlur={handleCreateSubmit}
              className="flex-1 bg-transparent border-none outline-none"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: scaled(12),
                color: 'var(--color-text)',
                padding: '1px 2px',
                borderBottom: '1px solid var(--color-accent)',
              }}
              placeholder={creating.type === 'file' ? 'filename' : 'folder name'}
            />
          </div>
        )}
      </div>

      {/* Inline rename overlay */}
      {renaming && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 100,
          }}
          onClick={() => setRenaming(null)}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'var(--color-surface)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '12px',
              minWidth: '240px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(11),
              color: 'var(--color-text-dim)',
              marginBottom: '8px',
            }}>
              Rename
            </p>
            <input
              ref={renameInputRef}
              value={renaming.name}
              onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit()
                if (e.key === 'Escape') setRenaming(null)
              }}
              className="w-full bg-transparent outline-none"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: scaled(12),
                color: 'var(--color-text)',
                padding: '4px 6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.04)',
              }}
            />
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 100,
          }}
          onClick={() => setDeleting(null)}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'var(--color-surface)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '12px',
              minWidth: '240px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(11),
              color: 'var(--color-text)',
              marginBottom: '8px',
            }}>
              Delete {deleting.split('/').pop()}?
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  deleteFileEntry(deleting)
                  setDeleting(null)
                }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: scaled(10),
                  color: 'var(--color-error, #ff5555)',
                  background: 'rgba(255, 85, 85, 0.1)',
                  border: '1px solid rgba(255, 85, 85, 0.2)',
                  borderRadius: '4px',
                  padding: '3px 10px',
                  cursor: 'pointer',
                }}
              >
                Yes
              </button>
              <button
                onClick={() => setDeleting(null)}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: scaled(10),
                  color: 'var(--color-text-dim)',
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '4px',
                  padding: '3px 10px',
                  cursor: 'pointer',
                }}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--color-surface)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            padding: '4px 0',
            zIndex: 200,
            minWidth: '140px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.entry.isDirectory && (
            <>
              <ContextMenuItem
                icon={Plus}
                label="New File"
                onClick={() => {
                  setCreating({ parentPath: contextMenu.entry.relativePath, type: 'file', name: '' })
                  setContextMenu(null)
                }}
              />
              <ContextMenuItem
                icon={FolderPlus}
                label="New Folder"
                onClick={() => {
                  setCreating({ parentPath: contextMenu.entry.relativePath, type: 'directory', name: '' })
                  setContextMenu(null)
                }}
              />
            </>
          )}
          {contextMenu.entry.relativePath !== '.' && (
            <>
              <ContextMenuItem
                icon={Edit3}
                label="Rename"
                onClick={() => {
                  setRenaming({ path: contextMenu.entry.relativePath, name: contextMenu.entry.name })
                  setContextMenu(null)
                }}
              />
              <ContextMenuItem
                icon={Trash2}
                label="Delete"
                danger
                onClick={() => {
                  setDeleting(contextMenu.entry.relativePath)
                  setContextMenu(null)
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ContextMenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof File
  label: string
  onClick: () => void
  danger?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full text-left transition-colors"
      style={{
        padding: '5px 12px',
        fontSize: scaled(11),
        fontFamily: 'var(--font-mono)',
        color: danger ? 'var(--color-error, #ff5555)' : 'var(--color-text)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  )
}

// --- Multi-Root File Tree ---

interface MultiRootTreeNodeProps {
  entry: FileEntry
  projectPath: string
  depth: number
  isActiveRoot: boolean
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void
}

function MultiRootTreeNode({ entry, projectPath, depth, isActiveRoot, onContextMenu }: MultiRootTreeNodeProps): JSX.Element {
  const trees = useAgentStore(s => s.multiRootTrees[projectPath]) ?? EMPTY_TREES
  const toggleRootDirectory = useAgentStore(s => s.toggleRootDirectory)

  const isExpanded = entry.isDirectory && entry.path in trees
  const children = trees[entry.path] || []
  const { Icon, color } = getFileIcon(entry)

  const openFile = useAgentStore(s => s.openFile)

  const handleClick = useCallback(() => {
    if (entry.isDirectory) {
      toggleRootDirectory(projectPath, entry.path)
    } else if (isActiveRoot) {
      // Open file via single-root file viewer (needs relative path)
      const rel = entry.path.startsWith(projectPath + '/') ? entry.path.slice(projectPath.length + 1) : entry.path
      openFile(rel)
    }
  }, [entry, projectPath, isActiveRoot, toggleRootDirectory, openFile])

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, entry)}
        className="flex items-center w-full text-left transition-colors rounded"
        style={{
          paddingLeft: `${depth * 16 + 4}px`,
          paddingRight: '4px',
          paddingTop: '2px',
          paddingBottom: '2px',
          fontSize: scaled(12),
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-text)',
          background: 'transparent',
          cursor: 'pointer',
          border: 'none',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        {entry.isDirectory && (
          <ChevronRight
            size={12}
            style={{
              color: 'var(--color-text-dim)',
              flexShrink: 0,
              marginRight: '2px',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}
          />
        )}
        {!entry.isDirectory && <span style={{ width: '14px', flexShrink: 0 }} />}
        {entry.isDirectory ? (
          isExpanded ? (
            <FolderOpen size={14} style={{ color: 'var(--color-accent)', flexShrink: 0, marginRight: '4px' }} />
          ) : (
            <Folder size={14} style={{ color, flexShrink: 0, marginRight: '4px' }} />
          )
        ) : (
          <Icon size={14} style={{ color, flexShrink: 0, marginRight: '4px' }} />
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {entry.isDirectory && isExpanded && children.map(child => (
        <MultiRootTreeNode
          key={child.path}
          entry={child}
          projectPath={projectPath}
          depth={depth + 1}
          isActiveRoot={isActiveRoot}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  )
}

interface MultiRootFileTreeProps {
  projectPath: string
  isActive: boolean
}

export function MultiRootFileTree({ projectPath, isActive }: MultiRootFileTreeProps): JSX.Element {
  const trees = useAgentStore(s => s.multiRootTrees[projectPath]) ?? EMPTY_TREES
  const deleteFileEntry = useAgentStore(s => s.deleteFileEntry)
  const renameFileEntry = useAgentStore(s => s.renameFileEntry)
  const createFileEntry = useAgentStore(s => s.createFileEntry)
  const createDirectoryEntry = useAgentStore(s => s.createDirectoryEntry)
  const openFile = useAgentStore(s => s.openFile)
  const switchProject = useAgentStore(s => s.switchProject)

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [creating, setCreating] = useState<{ parentPath: string; type: 'file' | 'directory'; name: string } | null>(null)
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const createInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const rootEntries = trees[projectPath] || []

  useEffect(() => {
    if (creating) createInputRef.current?.focus()
  }, [creating])
  useEffect(() => {
    if (renaming) renameInputRef.current?.focus()
  }, [renaming])

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }, [])

  // For active root file ops, we need relative paths from project root
  const toRelative = useCallback((absPath: string) => {
    return absPath.startsWith(projectPath + '/') ? absPath.slice(projectPath.length + 1) : absPath
  }, [projectPath])

  const handleRenameSubmit = useCallback(() => {
    if (!renaming || !renaming.name.trim()) { setRenaming(null); return }
    renameFileEntry(toRelative(renaming.path), renaming.name.trim())
    setRenaming(null)
  }, [renaming, renameFileEntry, toRelative])

  const handleCreateSubmit = useCallback(() => {
    if (!creating || !creating.name.trim()) { setCreating(null); return }
    const parentRel = toRelative(creating.parentPath)
    const fullPath = parentRel === '.' ? creating.name.trim() : `${parentRel}/${creating.name.trim()}`
    if (creating.type === 'file') {
      createFileEntry(fullPath)
    } else {
      createDirectoryEntry(fullPath)
    }
    setCreating(null)
  }, [creating, createFileEntry, createDirectoryEntry, toRelative])

  const handleFileClick = useCallback((entry: FileEntry) => {
    if (!entry.isDirectory && isActive) {
      openFile(toRelative(entry.path))
    }
  }, [isActive, openFile, toRelative])

  if (rootEntries.length === 0) {
    return (
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: scaled(11),
        color: 'var(--color-text-dim)',
        padding: '2px 4px 2px 20px',
      }}>
        Loading...
      </p>
    )
  }

  return (
    <div>
      {rootEntries.map(entry => (
        <MultiRootTreeNode
          key={entry.path}
          entry={entry}
          projectPath={projectPath}
          depth={1}
          isActiveRoot={isActive}
          onContextMenu={(e, ent) => {
            if (!ent.isDirectory && isActive) {
              handleFileClick(ent)
            }
            handleContextMenu(e, ent)
          }}
        />
      ))}

      {/* Inline create input */}
      {creating && (
        <div className="flex items-center gap-1" style={{ padding: '2px 4px', marginLeft: '36px' }}>
          {creating.type === 'directory' ? (
            <FolderPlus size={12} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          ) : (
            <Plus size={12} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          )}
          <input
            ref={createInputRef}
            value={creating.name}
            onChange={(e) => setCreating({ ...creating, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSubmit()
              if (e.key === 'Escape') setCreating(null)
            }}
            onBlur={handleCreateSubmit}
            className="flex-1 bg-transparent border-none outline-none"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(12),
              color: 'var(--color-text)',
              padding: '1px 2px',
              borderBottom: '1px solid var(--color-accent)',
            }}
            placeholder={creating.type === 'file' ? 'filename' : 'folder name'}
          />
        </div>
      )}

      {/* Rename overlay */}
      {renaming && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}
          onClick={() => setRenaming(null)}
        >
          <div
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'var(--color-surface)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px', padding: '12px', minWidth: '240px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: 'var(--color-text-dim)', marginBottom: '8px' }}>Rename</p>
            <input
              ref={renameInputRef}
              value={renaming.name}
              onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenaming(null) }}
              className="w-full bg-transparent outline-none"
              style={{
                fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text)',
                padding: '4px 6px', border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '4px', background: 'rgba(255, 255, 255, 0.04)',
              }}
            />
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}
          onClick={() => setDeleting(null)}
        >
          <div
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'var(--color-surface)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px', padding: '12px', minWidth: '240px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: 'var(--color-text)', marginBottom: '8px' }}>
              Delete {deleting.split('/').pop()}?
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { deleteFileEntry(toRelative(deleting)); setDeleting(null) }}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: scaled(10),
                  color: 'var(--color-error, #ff5555)', background: 'rgba(255, 85, 85, 0.1)',
                  border: '1px solid rgba(255, 85, 85, 0.2)', borderRadius: '4px',
                  padding: '3px 10px', cursor: 'pointer',
                }}
              >Yes</button>
              <button
                onClick={() => setDeleting(null)}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: scaled(10),
                  color: 'var(--color-text-dim)', background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '4px',
                  padding: '3px 10px', cursor: 'pointer',
                }}
              >No</button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            background: 'var(--color-surface)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px', padding: '4px 0', zIndex: 200,
            minWidth: '160px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {isActive ? (
            <>
              {contextMenu.entry.isDirectory && (
                <>
                  <ContextMenuItem icon={Plus} label="New File" onClick={() => {
                    setCreating({ parentPath: contextMenu.entry.path, type: 'file', name: '' })
                    setContextMenu(null)
                  }} />
                  <ContextMenuItem icon={FolderPlus} label="New Folder" onClick={() => {
                    setCreating({ parentPath: contextMenu.entry.path, type: 'directory', name: '' })
                    setContextMenu(null)
                  }} />
                </>
              )}
              {!contextMenu.entry.isDirectory && (
                <ContextMenuItem icon={FileCode2} label="Open" onClick={() => {
                  openFile(toRelative(contextMenu.entry.path))
                  setContextMenu(null)
                }} />
              )}
              <ContextMenuItem icon={Edit3} label="Rename" onClick={() => {
                setRenaming({ path: contextMenu.entry.path, name: contextMenu.entry.name })
                setContextMenu(null)
              }} />
              <ContextMenuItem icon={Trash2} label="Delete" danger onClick={() => {
                setDeleting(contextMenu.entry.path)
                setContextMenu(null)
              }} />
            </>
          ) : (
            <>
              {!contextMenu.entry.isDirectory && (
                <ContextMenuItem icon={FileCode2} label="Open (read-only)" onClick={() => {
                  // Switch to this project first, then open
                  setContextMenu(null)
                }} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
