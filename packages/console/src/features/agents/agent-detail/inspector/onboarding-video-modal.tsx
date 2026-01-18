import { createEffect, on, onCleanup, untrack } from "solid-js"
import { Modal, ModalContainer, ModalHeader } from "../../../../ui"

type OnboardingVideoModalProps = {
  open: boolean
  onClose: () => void
  currentTime: number
  onTimeUpdate: (time: number) => void
}

export function OnboardingVideoModal(props: OnboardingVideoModalProps) {
  let videoRef: HTMLVideoElement | undefined

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (open && videoRef) {
          const savedTime = untrack(() => props.currentTime)
          videoRef.currentTime = savedTime
          videoRef.play()
        }
      },
    ),
  )

  const handleTimeUpdate = () => {
    if (videoRef) {
      props.onTimeUpdate(videoRef.currentTime)
    }
  }

  const handleClose = () => {
    if (videoRef) {
      props.onTimeUpdate(videoRef.currentTime)
      videoRef.pause()
    }
    props.onClose()
  }

  onCleanup(() => {
    if (videoRef) {
      props.onTimeUpdate(videoRef.currentTime)
    }
  })

  return (
    <Modal open={props.open} onBackdropClick={handleClose} onEscape={handleClose}>
      <ModalContainer size="6xl">
        <ModalHeader title="Welcome to Synatra" onClose={handleClose} />
        <div class="p-4">
          <video
            ref={videoRef}
            class="block w-full rounded-lg"
            src="/videos/demo_with_subs.mp4"
            controls
            preload="auto"
            onTimeUpdate={handleTimeUpdate}
          />
        </div>
      </ModalContainer>
    </Modal>
  )
}
