import { useMutation, useQueryClient } from '@tanstack/react-query'
import type Konva from 'konva'
import { Loader2, MousePointer2, PencilRuler, RefreshCw, Scan, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Arrow,
  Circle,
  Image as KonvaImage,
  Layer,
  Line as KonvaLine,
  Rect,
  Stage,
} from 'react-konva'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createLine,
  deleteLine,
  fetchFrameBlobUrl,
  updateLine,
  updateRoi,
} from '@/features/streams/api'
import {
  LINE_COLORS,
  VEHICLE_CLASSES,
  type CountingLine,
  type Point,
  type Roi,
} from '@/features/streams/types'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

type Mode = 'select' | 'draw' | 'roi'

interface OverlayEditorProps {
  streamId: number
  lines: CountingLine[]
  roi: Roi | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)

function useElementWidth(element: HTMLElement | null) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [element])
  return width
}

function useImage(url: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) {
      setImage(null)
      return
    }
    const element = new window.Image()
    element.onload = () => setImage(element)
    element.onerror = () => setImage(null)
    element.src = url
    return () => {
      element.onload = null
    }
  }, [url])
  return image
}

export function OverlayEditor({ streamId, lines, roi, open, onOpenChange }: OverlayEditorProps) {
  const queryClient = useQueryClient()
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [frameState, setFrameState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [frameReload, setFrameReload] = useState(0)

  useEffect(() => {
    if (!open) return
    let active = true
    let objectUrl: string | null = null
    setFrameState('loading')
    fetchFrameBlobUrl(streamId)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setFrameUrl(url)
        setFrameState('ready')
      })
      .catch(() => {
        if (active) setFrameState('error')
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, streamId, frameReload])

  const image = useImage(frameUrl)

  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const width = useElementWidth(container)
  const aspect = image && image.naturalWidth ? image.naturalWidth / image.naturalHeight : 16 / 9
  const height = width > 0 ? width / aspect : 0

  const [mode, setMode] = useState<Mode>('select')
  const [localLines, setLocalLines] = useState<CountingLine[]>(lines)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Point[]>([])
  const [localRoi, setLocalRoi] = useState<Roi | null>(roi)
  const [roiStart, setRoiStart] = useState<Point | null>(null)

  // Reset working copies only when the editor opens (not on every refetch).
  useEffect(() => {
    if (open) {
      setLocalLines(lines)
      setLocalRoi(roi)
      setSelectedId(null)
      setDraft([])
      setMode('select')
    }
    // Intentionally depends only on `open`: this seeds the working copy once
    // per open, reading the latest props at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const selected = useMemo(
    () => localLines.find((line) => line.id === selectedId) ?? null,
    [localLines, selectedId],
  )

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['streams', streamId, 'lines'] })
    queryClient.invalidateQueries({ queryKey: ['streams', streamId] })
    queryClient.invalidateQueries({ queryKey: ['streams'] })
  }, [queryClient, streamId])

  const createMutation = useMutation({
    mutationFn: (input: { name: string; color: string; classes: string[]; points: Point[] }) =>
      createLine(streamId, input),
    onSuccess: (line) => {
      setLocalLines((current) => [...current, line])
      setSelectedId(line.id)
      invalidate()
      setDraft([])
      setMode('select')
      toast.success('Line added')
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not add the line'),
  })

  const saveMutation = useMutation({
    mutationFn: (line: CountingLine) =>
      updateLine(line.id, {
        name: line.name,
        color: line.color,
        classes: line.classes,
        points: line.points,
      }),
    onSuccess: (line) => {
      setLocalLines((current) => current.map((item) => (item.id === line.id ? line : item)))
      invalidate()
      toast.success('Line saved')
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not save the line'),
  })

  const removeMutation = useMutation({
    mutationFn: (lineId: number) => deleteLine(lineId),
    onSuccess: (_data, lineId) => {
      setLocalLines((current) => current.filter((item) => item.id !== lineId))
      setSelectedId(null)
      invalidate()
      toast.success('Line removed')
    },
  })

  const roiMutation = useMutation({
    mutationFn: (next: Roi | null) => updateRoi(streamId, next),
    onSuccess: () => {
      invalidate()
      toast.success('Region saved')
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not save the region'),
  })

  const toStage = (point: Point) => ({ x: point.x * width, y: point.y * height })
  const toNorm = (x: number, y: number): Point => ({
    x: clamp01(width ? x / width : 0),
    y: clamp01(height ? y / height : 0),
  })

  const handleStageClick = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (mode !== 'draw') return
    const stage = event.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (!pointer) return
    setDraft((points) => [...points, toNorm(pointer.x, pointer.y)])
  }

  const handleStageMouseDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (mode !== 'roi') return
    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) return
    setRoiStart(toNorm(pointer.x, pointer.y))
  }

  const handleStageMouseMove = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (mode !== 'roi' || !roiStart) return
    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) return
    const current = toNorm(pointer.x, pointer.y)
    setLocalRoi({
      x: Math.min(roiStart.x, current.x),
      y: Math.min(roiStart.y, current.y),
      width: Math.abs(current.x - roiStart.x),
      height: Math.abs(current.y - roiStart.y),
    })
  }

  const handleStageMouseUp = () => {
    if (mode !== 'roi' || !roiStart) return
    setRoiStart(null)
    setMode('select')
  }

  const updatePoint = (lineId: number, index: number, position: Point) => {
    setLocalLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? { ...line, points: line.points.map((p, i) => (i === index ? position : p)) }
          : line,
      ),
    )
  }

  const removePoint = (lineId: number, index: number) => {
    setLocalLines((current) =>
      current.map((line) => {
        if (line.id !== lineId || line.points.length <= 2) return line
        return { ...line, points: line.points.filter((_, i) => i !== index) }
      }),
    )
  }

  const addPointAt = (lineId: number, position: Point) => {
    setLocalLines((current) =>
      current.map((line) => {
        if (line.id !== lineId) return line
        const points = [...line.points]
        // Insert next to the closest existing vertex.
        let bestIndex = 0
        let bestDistance = Infinity
        points.forEach((point, index) => {
          const distance = (point.x - position.x) ** 2 + (point.y - position.y) ** 2
          if (distance < bestDistance) {
            bestDistance = distance
            bestIndex = index
          }
        })
        points.splice(bestIndex + 1, 0, position)
        return { ...line, points }
      }),
    )
  }

  const patchSelected = (patch: Partial<CountingLine>) => {
    if (!selectedId) return
    setLocalLines((current) =>
      current.map((line) => (line.id === selectedId ? { ...line, ...patch } : line)),
    )
  }

  const toggleClass = (value: string) => {
    if (!selected) return
    const classes = selected.classes.includes(value)
      ? selected.classes.filter((c) => c !== value)
      : [...selected.classes, value]
    if (classes.length === 0) return
    patchSelected({ classes })
  }

  const refreshFrame = () => setFrameReload((value) => value + 1)

  const roiRect = localRoi ? toStage({ x: localRoi.x, y: localRoi.y }) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Overlay editor</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <ModeButton
                active={mode === 'select'}
                onClick={() => setMode('select')}
                icon={<MousePointer2 className="h-4 w-4" />}
                label="Select"
              />
              <ModeButton
                active={mode === 'draw'}
                onClick={() => {
                  setSelectedId(null)
                  setDraft([])
                  setMode('draw')
                }}
                icon={<PencilRuler className="h-4 w-4" />}
                label="Draw line"
              />
              <ModeButton
                active={mode === 'roi'}
                onClick={() => setMode('roi')}
                icon={<Scan className="h-4 w-4" />}
                label="Region"
              />
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={refreshFrame}
                disabled={frameState === 'loading'}
              >
                {frameState === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                New frame
              </Button>
            </div>

            <div
              ref={setContainer}
              data-frame-state={frameState}
              data-has-image={image ? 'yes' : 'no'}
              className="relative overflow-hidden rounded-xl border border-hairline bg-[#0c0a09]"
              style={{ height: height || undefined, minHeight: height ? undefined : 320 }}
            >
              {!image || width === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-white/60">
                  {frameState === 'error' ? 'Could not load a frame' : 'Capturing frame…'}
                </div>
              ) : (
                <Stage
                  width={width}
                  height={height}
                  onClick={handleStageClick}
                  onMouseDown={handleStageMouseDown}
                  onMouseMove={handleStageMouseMove}
                  onMouseUp={handleStageMouseUp}
                  style={{ cursor: mode === 'draw' ? 'crosshair' : 'default' }}
                >
                  <Layer listening={false}>
                    <KonvaImage image={image} width={width} height={height} />
                  </Layer>
                  <Layer>
                    {roiRect && localRoi && (
                      <Rect
                        x={roiRect.x}
                        y={roiRect.y}
                        width={localRoi.width * width}
                        height={localRoi.height * height}
                        stroke="#ffffff"
                        strokeWidth={2}
                        dash={[6, 4]}
                        fill="rgba(255,255,255,0.05)"
                      />
                    )}

                    {localLines.map((line) => {
                      const points = line.points.flatMap((p) => {
                        const stage = toStage(p)
                        return [stage.x, stage.y]
                      })
                      const isSelected = line.id === selectedId
                      return (
                        <KonvaLine
                          key={line.id}
                          points={points}
                          stroke={line.color}
                          strokeWidth={isSelected ? 5 : 3}
                          hitStrokeWidth={18}
                          lineJoin="round"
                          lineCap="round"
                          onClick={() => {
                            setMode('select')
                            setSelectedId(line.id)
                          }}
                          onDblClick={(event) => {
                            const pointer = event.target.getStage()?.getPointerPosition()
                            if (pointer) addPointAt(line.id, toNorm(pointer.x, pointer.y))
                          }}
                        />
                      )
                    })}

                    {localLines.map((line) => {
                      if (line.id !== selectedId) return null
                      return (
                        <Arrow
                          key={`${line.id}-arrow`}
                          points={(() => {
                            const a = toStage(line.points[0])
                            const b = toStage(line.points[1] ?? line.points[0])
                            return [
                              a.x,
                              a.y,
                              a.x + (b.x - a.x) * 0.45,
                              a.y + (b.y - a.y) * 0.45,
                            ]
                          })()}
                          stroke={line.color}
                          fill={line.color}
                          pointerLength={10}
                          pointerWidth={10}
                          strokeWidth={3}
                        />
                      )
                    })}

                    {localLines.map((line) =>
                      line.id === selectedId
                        ? line.points.map((point, index) => {
                            const stage = toStage(point)
                            const isEntry = index === 0
                            return (
                              <Circle
                                key={`${line.id}-${index}`}
                                x={stage.x}
                                y={stage.y}
                                radius={isEntry ? 9 : 6}
                                fill={isEntry ? '#ffffff' : line.color}
                                stroke={isEntry ? line.color : '#ffffff'}
                                strokeWidth={isEntry ? 3 : 2}
                                draggable={mode === 'select'}
                                onDragMove={(event) =>
                                  updatePoint(
                                    line.id,
                                    index,
                                    toNorm(event.target.x(), event.target.y()),
                                  )
                                }
                                onDblClick={() => removePoint(line.id, index)}
                              />
                            )
                          })
                        : null,
                    )}

                    {draft.length > 0 && (
                      <KonvaLine
                        points={draft.flatMap((p) => {
                          const stage = toStage(p)
                          return [stage.x, stage.y]
                        })}
                        stroke="#a7e5d3"
                        strokeWidth={3}
                        dash={[8, 6]}
                      />
                    )}
                    {draft.map((point, index) => {
                      const stage = toStage(point)
                      return (
                        <Circle
                          key={`draft-${index}`}
                          x={stage.x}
                          y={stage.y}
                          radius={index === 0 ? 9 : 6}
                          fill={index === 0 ? '#ffffff' : '#a7e5d3'}
                          stroke="#a7e5d3"
                          strokeWidth={2}
                        />
                      )
                    })}
                  </Layer>
                </Stage>
              )}
            </div>

            <p className="text-xs text-muted">
              {mode === 'draw'
                ? 'Click along the lane to place points. The first point is the entry end.'
                : mode === 'roi'
                  ? 'Drag across the video to set the region of interest.'
                  : 'Select a line to drag its vertices. Double-click a vertex to remove it, or the line to add one.'}
            </p>
          </div>

          <div className="space-y-4 overflow-y-auto lg:max-h-[70vh]">
            {mode === 'draw' ? (
              <DraftPanel
                points={draft}
                onCreate={(name, color, classes) =>
                  createMutation.mutate({ name, color, classes, points: draft })
                }
                onCancel={() => {
                  setDraft([])
                  setMode('select')
                }}
                isPending={createMutation.isPending}
              />
            ) : selected ? (
              <SelectedPanel
                line={selected}
                onChange={patchSelected}
                onToggleClass={toggleClass}
                onSave={() => saveMutation.mutate(selected)}
                onDelete={() => removeMutation.mutate(selected.id)}
                isSaving={saveMutation.isPending}
                isDeleting={removeMutation.isPending}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-hairline-strong bg-canvas-soft p-4 text-sm text-muted">
                {localLines.length === 0
                  ? 'No lines yet. Use “Draw line” to add one along a lane.'
                  : 'Select a line on the video to edit it, or draw a new one.'}
              </div>
            )}

            <div className="rounded-xl border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Region of interest</Label>
                {localRoi && (
                  <button
                    type="button"
                    className="text-xs text-muted transition hover:text-ink"
                    onClick={() => setLocalRoi(null)}
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">
                Detections outside the region are ignored. Optional.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                disabled={roiMutation.isPending}
                onClick={() => roiMutation.mutate(localRoi)}
              >
                {roiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save region
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
        active ? 'bg-surface-strong text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function ClassToggles({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {VEHICLE_CLASSES.map((option) => {
        const active = selected.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition',
              active
                ? 'border-transparent bg-surface-strong text-ink'
                : 'border-hairline text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {LINE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Use color ${color}`}
          onClick={() => onChange(color)}
          className={cn(
            'h-6 w-6 rounded-full border-2 transition',
            value === color ? 'border-ink' : 'border-transparent',
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  )
}

function DraftPanel({
  points,
  onCreate,
  onCancel,
  isPending,
}: {
  points: Point[]
  onCreate: (name: string, color: string, classes: string[]) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [name, setName] = useState('Lane')
  const [color, setColor] = useState<string>(LINE_COLORS[0])
  const [classes, setClasses] = useState<string[]>(['car', 'truck', 'bus', 'motorcycle'])

  const toggle = (value: string) => {
    setClasses((current) =>
      current.includes(value)
        ? current.filter((c) => c !== value)
        : [...current, value],
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-surface p-4">
      <p className="font-sans text-sm font-medium text-ink">New line</p>
      <div className="space-y-1.5">
        <Label htmlFor="line-name" className="text-xs">
          Name
        </Label>
        <Input
          id="line-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Color</Label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Classes</Label>
        <ClassToggles selected={classes} onToggle={toggle} />
      </div>
      <p className="text-xs text-muted">{points.length} points placed (minimum 2).</p>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={points.length < 2 || classes.length === 0 || !name.trim() || isPending}
          onClick={() => onCreate(name.trim(), color, classes)}
        >
          Add line
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function SelectedPanel({
  line,
  onChange,
  onToggleClass,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  line: CountingLine
  onChange: (patch: Partial<CountingLine>) => void
  onToggleClass: (value: string) => void
  onSave: () => void
  onDelete: () => void
  isSaving: boolean
  isDeleting: boolean
}) {
  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-surface p-4">
      <p className="font-sans text-sm font-medium text-ink">Edit line</p>
      <div className="space-y-1.5">
        <Label htmlFor="edit-line-name" className="text-xs">
          Name
        </Label>
        <Input
          id="edit-line-name"
          value={line.name}
          onChange={(event) => onChange({ name: event.target.value })}
          maxLength={120}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Color</Label>
        <ColorPicker value={line.color} onChange={(color) => onChange({ color })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Classes</Label>
        <ClassToggles selected={line.classes} onToggle={onToggleClass} />
      </div>
      <p className="text-xs text-muted">{line.points.length} points.</p>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={`Delete ${line.name}`}
          onClick={onDelete}
          disabled={isDeleting}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}