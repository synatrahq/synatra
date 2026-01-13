import { createSignal, Show } from "solid-js"
import { Modal, ModalContainer, ModalHeader, ModalBody, ModalFooter, Button } from "../../ui"
import { Copy, Check, Warning } from "phosphor-solid-js"

type ConnectorTokenModalProps = {
  open: boolean
  connectorName: string
  token: string
  onClose: () => void
}

export function ConnectorTokenModal(props: ConnectorTokenModalProps) {
  const [copied, setCopied] = createSignal(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(props.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const gatewayUrl = () => {
    const base = import.meta.env.VITE_GATEWAY_URL || "ws://localhost:3003"
    return `${base}/connector/ws`
  }

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="md">
        <ModalHeader title="Connector token" onClose={props.onClose} />
        <ModalBody>
          <div class="flex items-start gap-2 rounded-md border border-warning bg-warning-soft p-2.5">
            <Warning class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" weight="fill" />
            <p class="text-2xs text-warning">
              Copy this token now. You won't be able to see it again. Store it securely.
            </p>
          </div>
          <div class="mt-3">
            <label class="mb-1 block text-2xs font-medium text-text-muted">Token for {props.connectorName}</label>
            <div class="flex items-center gap-2">
              <code class="flex-1 overflow-x-auto rounded border border-border bg-surface-muted px-2.5 py-2 font-code text-2xs text-text scrollbar-thin">
                {props.token}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Show when={copied()} fallback={<Copy class="h-3.5 w-3.5" />}>
                  <Check class="h-3.5 w-3.5 text-success" />
                </Show>
                {copied() ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
          <div class="mt-4 space-y-2">
            <div>
              <label class="mb-1 block text-2xs text-text-muted">Environment variables</label>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface-muted px-2.5 py-2 font-code text-2xs text-text-muted scrollbar-thin">
                {`GATEWAY_URL=${gatewayUrl()}
CONNECTOR_TOKEN=${props.token}`}
              </code>
            </div>
            <div>
              <label class="mb-1 block text-2xs text-text-muted">Docker</label>
              <code class="block overflow-x-auto whitespace-pre rounded border border-border bg-surface-muted px-2.5 py-2 font-code text-2xs text-text-muted scrollbar-thin">
                {`docker run -d \\
  -e GATEWAY_URL=${gatewayUrl()} \\
  -e CONNECTOR_TOKEN=${props.token} \\
  ghcr.io/synatrahq/connector:latest`}
              </code>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button size="sm" onClick={props.onClose}>
            Done
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
