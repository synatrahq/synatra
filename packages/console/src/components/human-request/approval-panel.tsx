import { Show, createSignal, createMemo } from "solid-js"
import {
  Button,
  Badge,
  Spinner,
  Textarea,
  Markdown,
  Modal,
  ModalContainer,
  ModalHeader,
  ModalBody,
  ModalFooter,
  CodeEditor,
  Tooltip,
} from "../../ui"
import { Wrench, CaretDown, CaretRight, Clock } from "phosphor-solid-js"
import { formatRemainingTime } from "./utils"
import type { HumanRequestApprovalConfig } from "@synatra/core/types"
import type { ThreadHumanRequest, ThreadAgent } from "../../app/api"

type ApprovalPanelProps = {
  request: ThreadHumanRequest
  agent?: ThreadAgent | null
  currentUserId?: string | null
  threadCreatedBy?: string | null
  isChannelOwner?: boolean
  onRespond?: (requestId: string, action: "respond" | "cancel" | "skip", data?: unknown) => void
  responding?: boolean
}

export function ApprovalPanel(props: ApprovalPanelProps) {
  const [expanded, setExpanded] = createSignal(false)
  const [showApproveModal, setShowApproveModal] = createSignal(false)
  const [showRejectModal, setShowRejectModal] = createSignal(false)
  const [rejectReason, setRejectReason] = createSignal("")
  const [showCode, setShowCode] = createSignal(false)
  const [showCardCode, setShowCardCode] = createSignal(false)

  const config = () => {
    const fields = props.request.config?.fields
    if (!fields || fields.length === 0) return null
    const field = fields[0]
    if (field.kind !== "approval") return null
    return field as HumanRequestApprovalConfig & { key: string }
  }

  const toolName = () => config()?.action.name ?? "unknown"
  const params = () => config()?.action.params ?? {}
  const rationale = () => config()?.action.rationale

  const toolDef = () => props.agent?.runtimeConfig?.tools.find((t) => t.name === toolName())

  const authorityLabel = createMemo(() => {
    if (props.request.authority !== "owner_only") return null
    return "Channel owners only"
  })

  const disableReason = createMemo(() => {
    if (props.request.authority === "owner_only" && !props.isChannelOwner) {
      return "Only channel owners can approve this request"
    }
    return null
  })

  const remainingTime = createMemo(() => formatRemainingTime(props.request.expiresAt))

  const variantClass = createMemo(() => {
    const variant = config()?.variant ?? "warning"
    switch (variant) {
      case "danger":
        return "border-danger/50 bg-danger/5"
      case "info":
        return "border-primary/50 bg-primary/5"
      default:
        return "border-warning/50 bg-warning/5"
    }
  })

  const badgeVariant = createMemo(() => {
    const variant = config()?.variant ?? "warning"
    return variant === "danger" ? "destructive" : variant === "info" ? "secondary" : "warning"
  })

  const handleApprove = () => {
    if (props.onRespond) {
      props.onRespond(props.request.id, "respond", { approved: true })
      setShowApproveModal(false)
    }
  }

  const handleReject = () => {
    if (props.onRespond) {
      props.onRespond(props.request.id, "respond", { approved: false, comment: rejectReason() || undefined })
      setShowRejectModal(false)
      setRejectReason("")
    }
  }

  return (
    <>
      <div class={`rounded-lg border p-3 ${variantClass()}`}>
        <div class="flex flex-wrap items-center gap-1.5 mb-1">
          <Badge variant={badgeVariant()} class="text-2xs">
            Approval needed
          </Badge>
          <code class="font-code bg-surface px-1.5 py-0.5 rounded text-text text-2xs">{toolName()}</code>
          <Show when={authorityLabel()}>
            <Badge variant="secondary" class="text-2xs">
              {authorityLabel()}
            </Badge>
          </Show>
          <Show when={remainingTime()}>
            <span class="flex items-center gap-0.5 text-2xs text-text-muted">
              <Clock class="h-3 w-3" />
              {remainingTime()}
            </span>
          </Show>
        </div>

        <Show when={rationale()}>
          <div class="mb-2 rounded-md bg-surface/80 px-2.5 py-2">
            <Markdown class="text-xs text-text">{rationale()!}</Markdown>
          </div>
        </Show>

        <button
          type="button"
          class="flex items-center gap-1 text-2xs text-text-muted hover:text-text transition-colors mb-2"
          onClick={() => setExpanded(!expanded())}
        >
          {expanded() ? <CaretDown class="h-3 w-3" /> : <CaretRight class="h-3 w-3" />}
          <span>Parameters</span>
        </button>

        <Show when={expanded()}>
          <div class="mb-2 rounded-md bg-surface p-2 font-code text-2xs text-text-secondary overflow-x-auto">
            <pre class="whitespace-pre-wrap">{JSON.stringify(params(), null, 2)}</pre>
          </div>
        </Show>

        <Show when={toolDef()?.code}>
          <button
            type="button"
            class="flex items-center gap-1 text-2xs text-text-muted hover:text-text transition-colors mb-2"
            onClick={() => setShowCardCode(!showCardCode())}
          >
            {showCardCode() ? <CaretDown class="h-3 w-3" /> : <CaretRight class="h-3 w-3" />}
            <span>Source code</span>
          </button>

          <Show when={showCardCode()}>
            <div class="mb-2 rounded-md bg-surface overflow-hidden border border-border">
              <div class="max-h-48 overflow-y-auto">
                <CodeEditor value={toolDef()!.code} language="javascript" readonly />
              </div>
            </div>
          </Show>
        </Show>

        <div class="flex items-center gap-1.5">
          <Show
            when={!disableReason()}
            fallback={
              <Tooltip content={disableReason()!}>
                <Button variant="default" size="sm" disabled class="bg-success/50 h-7 text-xs cursor-not-allowed">
                  Approve
                </Button>
              </Tooltip>
            }
          >
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowApproveModal(true)}
              disabled={props.responding}
              class="bg-success hover:bg-success-hover h-7 text-xs"
            >
              Approve
            </Button>
          </Show>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRejectModal(true)}
            disabled={props.responding}
            class="h-7 text-xs"
          >
            Reject
          </Button>
        </div>
      </div>

      <Modal
        open={showApproveModal()}
        onBackdropClick={() => setShowApproveModal(false)}
        onEscape={() => setShowApproveModal(false)}
      >
        <ModalContainer size="2xl">
          <ModalHeader title="Confirm Approval" onClose={() => setShowApproveModal(false)} />
          <ModalBody>
            <div class="space-y-3">
              <p class="text-sm text-text">Are you sure you want to approve this action?</p>
              <div class="rounded-md bg-surface-muted p-3">
                <div class="flex items-center gap-1.5 mb-2">
                  <Wrench class="h-3.5 w-3.5 text-text-muted" />
                  <code class="font-code text-xs text-text">{toolName()}</code>
                </div>
                <Show when={toolDef()?.description}>
                  <p class="text-xs text-text-secondary mb-2">{toolDef()!.description}</p>
                </Show>
                <p class="text-2xs text-text-muted mb-1">Parameters</p>
                <div class="font-code text-2xs text-text-secondary overflow-x-auto max-h-32 overflow-y-auto">
                  <pre class="whitespace-pre-wrap">{JSON.stringify(params(), null, 2)}</pre>
                </div>
              </div>
              <Show when={toolDef()?.code}>
                <div class="rounded-md bg-surface-muted overflow-hidden">
                  <button
                    type="button"
                    class="flex items-center gap-1.5 w-full px-3 py-2 text-2xs text-text-muted hover:text-text transition-colors"
                    onClick={() => setShowCode(!showCode())}
                  >
                    {showCode() ? <CaretDown class="h-3 w-3" /> : <CaretRight class="h-3 w-3" />}
                    <span>View source code</span>
                  </button>
                  <Show when={showCode()}>
                    <div class="max-h-64 overflow-y-auto border-t border-border/50">
                      <CodeEditor value={toolDef()!.code} language="javascript" readonly />
                    </div>
                  </Show>
                </div>
              </Show>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" size="sm" onClick={() => setShowApproveModal(false)} disabled={props.responding}>
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleApprove}
              disabled={props.responding}
              class="bg-success hover:bg-success-hover"
            >
              {props.responding && <Spinner size="xs" class="border-white border-t-transparent" />}
              {props.responding ? "Approving..." : "Approve"}
            </Button>
          </ModalFooter>
        </ModalContainer>
      </Modal>

      <Modal
        open={showRejectModal()}
        onBackdropClick={() => setShowRejectModal(false)}
        onEscape={() => setShowRejectModal(false)}
      >
        <ModalContainer size="md">
          <ModalHeader title="Reject Action" onClose={() => setShowRejectModal(false)} />
          <ModalBody>
            <div class="space-y-3">
              <p class="text-sm text-text">Are you sure you want to reject this action?</p>
              <div class="rounded-md bg-surface-muted p-3">
                <div class="flex items-center gap-1.5 mb-2">
                  <Wrench class="h-3.5 w-3.5 text-text-muted" />
                  <code class="font-code text-xs text-text">{toolName()}</code>
                </div>
                <Show when={toolDef()?.description}>
                  <p class="text-xs text-text-secondary">{toolDef()!.description}</p>
                </Show>
              </div>
              <div class="space-y-1.5">
                <label class="text-xs text-text-muted">Reason (optional)</label>
                <Textarea
                  value={rejectReason()}
                  onInput={(e) => setRejectReason(e.currentTarget.value)}
                  placeholder="Explain why you're rejecting this action..."
                  rows={3}
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" size="sm" onClick={() => setShowRejectModal(false)} disabled={props.responding}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleReject} disabled={props.responding}>
              {props.responding && <Spinner size="xs" class="border-white border-t-transparent" />}
              {props.responding ? "Rejecting..." : "Reject"}
            </Button>
          </ModalFooter>
        </ModalContainer>
      </Modal>
    </>
  )
}
