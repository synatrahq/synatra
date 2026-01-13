import { createSignal, Show } from "solid-js"
import { Title, Meta } from "@solidjs/meta"
import { useSearchParams } from "@solidjs/router"
import { EnvelopeSimple, WarningCircle, ArrowLeft } from "phosphor-solid-js"
import { auth, GuestGuard } from "../app"
import { Button } from "../ui/button"
import { Input } from "../ui/input"

type Status = "idle" | "pending" | "sent" | "error" | "google-pending"

function decode(value: string | undefined): string | undefined {
  if (!value) return value
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function Logo(props: { size?: number }) {
  const size = () => props.size ?? 18
  return (
    <svg width={size()} height={size()} viewBox="0 0 1248 1244" xmlns="http://www.w3.org/2000/svg">
      <rect width="1248" height="1244" rx="200" ry="200" fill="currentColor" />
    </svg>
  )
}

function GoogleIcon(props: { size?: number }) {
  const size = () => props.size ?? 16
  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function Login() {
  const [searchParams] = useSearchParams()
  const rawEmail = Array.isArray(searchParams.email) ? searchParams.email[0] : searchParams.email
  const rawOrg = Array.isArray(searchParams.org) ? searchParams.org[0] : searchParams.org
  const initialEmail = decode(rawEmail)
  const orgName = decode(rawOrg)
  const [email, setEmail] = createSignal(initialEmail ?? "")
  const [status, setStatus] = createSignal<Status>("idle")
  const [errorMessage, setErrorMessage] = createSignal("")

  const callbackURL = () => {
    const returnTo = decode(searchParams.returnTo as string | undefined) || "/inbox"
    return `${window.location.origin}${returnTo}`
  }

  const submit = async () => {
    const value = email().trim()
    if (!value) return
    setStatus("pending")
    setErrorMessage("")
    const { error } = await auth.signIn.magicLink({ email: value, callbackURL: callbackURL() })

    if (error) {
      setStatus("error")
      setErrorMessage(error.message ?? "Failed to send magic link.")
      return
    }
    setStatus("sent")
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const s = status()
    if (e.key === "Enter" && email().trim() && s !== "pending" && s !== "google-pending") submit()
  }

  const signInWithGoogle = async () => {
    setStatus("google-pending")
    setErrorMessage("")
    const { error } = await auth.signIn.social({ provider: "google", callbackURL: callbackURL() })
    if (error) {
      setStatus("error")
      setErrorMessage(error.message ?? "Failed to sign in with Google.")
    }
  }

  const resetForm = () => {
    setStatus("idle")
    setErrorMessage("")
  }

  return (
    <>
      <Title>Sign in | Synatra</Title>
      <Meta name="description" content="Sign in to the AI workspace for human-AI collaboration." />
      <main class="flex min-h-screen items-center justify-center bg-surface p-4">
        <GuestGuard>
          <Show
            when={status() !== "sent"}
            fallback={
              <div class="flex flex-col items-center gap-1.5">
                <div class="flex h-9 w-9 items-center justify-center rounded-md bg-success-soft text-success">
                  <EnvelopeSimple size={18} weight="duotone" />
                </div>
                <div class="space-y-0.5 text-center">
                  <h1 class="text-sm font-semibold text-text">Check your email</h1>
                  <p class="text-xs text-text-muted">
                    We sent a magic link to <span class="font-medium text-text">{email()}</span>
                  </p>
                  <p class="text-2xs text-text-muted">Open it within a few minutes to continue.</p>
                </div>
                <button
                  type="button"
                  onClick={resetForm}
                  class="mt-1 inline-flex items-center gap-1 text-2xs font-medium text-text-muted underline-offset-4 hover:text-text"
                >
                  <ArrowLeft size={12} />
                  Use a different email
                </button>
              </div>
            }
          >
            <div class="mb-4 flex flex-col items-center gap-1.5">
              <div class="flex h-9 w-9 items-center justify-center rounded-md text-text">
                <Logo size={18} />
              </div>
              <div class="space-y-0.5 text-center">
                <Show
                  when={orgName}
                  fallback={
                    <>
                      <h1 class="text-sm font-semibold text-text">Sign in to Synatra</h1>
                      <p class="text-xs text-text-muted">Use your work email to continue.</p>
                    </>
                  }
                >
                  <h1 class="text-sm font-semibold text-text">Join {orgName}</h1>
                  <p class="text-xs text-text-muted">
                    You've been invited to <span class="font-medium text-text">{orgName}</span>.
                  </p>
                </Show>
              </div>
            </div>

            <div class="space-y-3">
              <Button
                type="button"
                variant="outline"
                onClick={signInWithGoogle}
                disabled={status() === "google-pending" || status() === "pending"}
                class="w-full"
              >
                <GoogleIcon size={14} />
                {status() === "google-pending" ? "Signing in..." : "Continue with Google"}
              </Button>

              <div class="flex items-center gap-2">
                <div class="flex-1 border-t border-border" />
                <span class="text-2xs text-text-muted">or</span>
                <div class="flex-1 border-t border-border" />
              </div>

              <Input
                id="email"
                type="email"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="you@company.com"
                autocomplete="email"
                hasError={status() === "error"}
              />

              <Button
                type="button"
                onClick={submit}
                disabled={status() === "pending" || status() === "google-pending" || !email().trim()}
                class="w-full"
              >
                {status() === "pending" ? "Sending..." : "Continue with email"}
              </Button>
            </div>

            <Show when={status() === "error" && errorMessage()}>
              <div class="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft p-2">
                <WarningCircle size={14} weight="fill" class="mt-0.5 shrink-0 text-danger" />
                <p class="text-xs text-danger">{errorMessage()}</p>
              </div>
            </Show>
          </Show>
        </GuestGuard>
      </main>
    </>
  )
}
