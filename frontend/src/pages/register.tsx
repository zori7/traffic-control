import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { AuthLayout } from '@/components/layout/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'

const schema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Enter at least 3 characters')
      .max(64, 'Too long')
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Use letters, numbers, ".", "_" or "-" only'),
    password: z.string().min(8, 'Use at least 8 characters').max(128, 'Too long'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

type FormValues = z.infer<typeof schema>

export function RegisterPage() {
  const { register: registerUser } = useAuth()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '', confirmPassword: '' },
  })

  async function onSubmit(values: FormValues) {
    try {
      const user = await registerUser({ username: values.username, password: values.password })
      toast.success(`Welcome, ${user.username}`)
      navigate('/streams', { replace: true })
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
      setError('root', { message })
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up a workspace and start counting in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-ink underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            autoFocus
            aria-invalid={Boolean(errors.username)}
            {...register('username')}
          />
          {errors.username && <p className="text-xs text-error">{errors.username.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
          {errors.password && <p className="text-xs text-error">{errors.password.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmPassword)}
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-error">{errors.confirmPassword.message}</p>
          )}
        </div>

        {errors.root && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error"
          >
            {errors.root.message}
          </motion.p>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}