import { createSignal, Show } from "solid-js"
import { Copy, Check, ArrowsClockwise } from "phosphor-solid-js"
import {
  FormField,
  Input,
  IconButton,
  Button,
  Spinner,
  Modal,
  ModalContainer,
  ModalFooter,
  CollapsibleSection,
} from "../../../ui"

type EndpointSectionProps = {
  webhookUrl: string
  webhookSecret: string
  curlCommand: string
  onRegenerateSecret: () => Promise<void>
}

function CopyButton(props: { value: string }) {
  const [copied, setCopied] = createSignal(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(props.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <IconButton variant="ghost" size="sm" onClick={handleCopy}>
      <Show when={copied()} fallback={<Copy class="h-3.5 w-3.5" />}>
        <Check class="h-3.5 w-3.5 text-success" />
      </Show>
    </IconButton>
  )
}

export function EndpointSection(props: EndpointSectionProps) {
  const [regenerateModalOpen, setRegenerateModalOpen] = createSignal(false)
  const [regenerating, setRegenerating] = createSignal(false)

  const handleRegenerateSecret = async () => {
    setRegenerating(true)
    try {
      await props.onRegenerateSecret()
      setRegenerateModalOpen(false)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <>
      <CollapsibleSection title="Endpoint">
        <div class="space-y-3">
          <FormField horizontal labelWidth="5rem" label="URL">
            <div class="flex items-center gap-1">
              <Input type="text" value={props.webhookUrl} readOnly class="flex-1 font-code text-xs" />
              <CopyButton value={props.webhookUrl} />
            </div>
          </FormField>
          <FormField horizontal labelWidth="5rem" label="Secret">
            <div class="flex items-center gap-1">
              <Input type="password" value={props.webhookSecret} readOnly class="flex-1 font-code text-xs" />
              <CopyButton value={props.webhookSecret} />
              <IconButton
                variant="ghost"
                size="sm"
                onClick={() => setRegenerateModalOpen(true)}
                title="Regenerate secret"
              >
                <ArrowsClockwise class="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </FormField>
          <div>
            <div class="mb-1.5 text-2xs font-medium text-text-muted">Example</div>
            <div class="flex items-start gap-1">
              <pre class="flex-1 overflow-x-auto rounded-md bg-surface-muted p-2 font-code text-2xs text-text-muted">
                {props.curlCommand}
              </pre>
              <CopyButton value={props.curlCommand} />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <Modal
        open={regenerateModalOpen()}
        onBackdropClick={() => setRegenerateModalOpen(false)}
        onEscape={() => setRegenerateModalOpen(false)}
      >
        <ModalContainer size="sm">
          <div class="border-b border-border px-4 py-3">
            <h3 class="text-xs font-medium text-text">Regenerate secret</h3>
          </div>
          <div class="flex flex-col gap-1 p-4">
            <p class="text-xs text-text-muted">Are you sure you want to regenerate the webhook secret?</p>
            <p class="text-2xs text-text-muted">Existing integrations using the current secret will stop working.</p>
          </div>
          <ModalFooter>
            <>
              <Button variant="ghost" size="sm" onClick={() => setRegenerateModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={handleRegenerateSecret} disabled={regenerating()}>
                <Show when={regenerating()}>
                  <Spinner size="xs" class="border-white border-t-transparent" />
                </Show>
                {regenerating() ? "Regenerating..." : "Regenerate"}
              </Button>
            </>
          </ModalFooter>
        </ModalContainer>
      </Modal>
    </>
  )
}
