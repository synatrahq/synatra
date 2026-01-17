import { Play } from "phosphor-solid-js"

type OnboardingVideoInspectorProps = {
  onOpenModal: () => void
}

export function OnboardingVideoInspector(props: OnboardingVideoInspectorProps) {
  return (
    <div class="flex h-full flex-col p-4">
      <div class="mb-4">
        <h2 class="text-base font-medium text-text">Welcome to Synatra</h2>
        <p class="mt-1 text-xs text-text-muted">Build AI agents with powerful tools and seamless integrations.</p>
      </div>

      <div class="mb-3 text-xs text-text-muted">Watch this video while we configure your agent</div>

      <button
        type="button"
        class="group relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black"
        onClick={() => props.onOpenModal()}
      >
        <video
          class="h-full w-full object-contain pointer-events-none"
          src="/videos/demo_with_subs.mp4"
          preload="metadata"
        />
        <div class="absolute inset-0 flex items-center justify-center bg-black/40 transition-colors group-hover:bg-black/50">
          <div class="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black transition-transform group-hover:scale-110">
            <Play class="h-6 w-6" weight="fill" />
          </div>
        </div>
      </button>
    </div>
  )
}
