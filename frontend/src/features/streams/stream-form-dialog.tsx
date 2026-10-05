import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'

import { createStream, updateStream } from './api'
import type { Stream } from './types'

const schema = z.object({
  name: z.string().trim().min(1, 'Give the stream a name').max(120, 'Keep it under 120 characters'),
  source_url: z
    .string()
    .trim()
    .min(1, 'Enter the stream URL')
    .max(1024, 'That URL is too long')
    .refine(
      (value) => /^(https?|rtsp|rtmps?):\/\/\S+$/i.test(value),
      'Enter a valid URL (http, https, rtsp or rtmp)',
    ),
  description: z.string().max(2000, 'Keep it under 2000 characters').optional(),
})

type FormValues = z.infer<typeof schema>

export function StreamFormDialog({
  open,
  onOpenChange,
  stream,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stream?: Stream
  onCreated?: (stream: Stream) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(stream)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', source_url: '', description: '' },
  })

  useEffect(() => {
    if (!open) return
    reset({
      name: stream?.name ?? '',
      source_url: stream?.source_url ?? '',
      description: stream?.description ?? '',
    })
  }, [open, stream, reset])

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        name: values.name.trim(),
        source_url: values.source_url.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
      }
      return stream ? updateStream(stream.id, payload) : createStream(payload)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['streams'] })
      queryClient.setQueryData(['streams', saved.id], saved)
      toast.success(isEdit ? 'Stream updated' : 'Stream connected')
      onOpenChange(false)
      if (!isEdit) onCreated?.(saved)
    },
  })

  async function onSubmit(values: FormValues) {
    try {
      await mutation.mutateAsync(values)
    } catch (error) {
      setError('root', {
        message:
          error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit stream' : 'Connect a stream'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the source details for this stream.'
              : 'Point Traffic Control at a live stream URL. HLS (.m3u8), RTSP and RTMP sources are accepted.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="stream-name">Name</Label>
            <Input
              id="stream-name"
              autoFocus
              aria-invalid={Boolean(errors.name)}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-error">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stream-url">Source URL</Label>
            <Input
              id="stream-url"
              inputMode="url"
              placeholder="https://camera.example.com/live.m3u8"
              aria-invalid={Boolean(errors.source_url)}
              {...register('source_url')}
            />
            {errors.source_url && <p className="text-xs text-error">{errors.source_url.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stream-description">
              Description <span className="text-muted-soft">(optional)</span>
            </Label>
            <Textarea id="stream-description" rows={3} {...register('description')} />
            {errors.description && (
              <p className="text-xs text-error">{errors.description.message}</p>
            )}
          </div>

          {errors.root && (
            <p className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
              {errors.root.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save changes' : 'Connect stream'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
