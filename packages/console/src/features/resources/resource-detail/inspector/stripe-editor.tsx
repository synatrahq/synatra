import { Input, FormField } from "../../../../ui"
import type { StripeEditorConfig } from "../constants"
import { SensitiveInput } from "./shared"

export function StripeConfigEditorContent(props: {
  config: StripeEditorConfig
  onChange: (config: StripeEditorConfig) => void
}) {
  return (
    <div class="flex flex-col gap-3">
      <FormField label="API Key">
        <SensitiveInput
          type="password"
          value={props.config.apiKey}
          placeholder="sk_live_..."
          onChange={(v) => props.onChange({ ...props.config, apiKey: v })}
          class="font-code"
        />
      </FormField>

      <FormField label="API Version">
        <Input
          type="text"
          value={props.config.apiVersion}
          onInput={(e) => props.onChange({ ...props.config, apiVersion: e.currentTarget.value })}
        />
      </FormField>
    </div>
  )
}
