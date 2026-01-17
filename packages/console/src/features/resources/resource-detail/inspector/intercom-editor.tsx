import { Show } from "solid-js"
import { Plus } from "phosphor-solid-js"
import type { IntercomMetadata } from "@synatra/core/types"
import { Select, FormField, type SelectOption } from "../../../../ui"
import { AppIcon } from "../../../../components"
import type { IntercomEditorConfig } from "../constants"
import type { AppAccounts } from "../../../../app/api"

export function IntercomConfigEditorContent(props: {
  config: IntercomEditorConfig
  appAccounts: AppAccounts
  onChange: (config: IntercomEditorConfig) => void
  onAppConnect?: (appId: string) => void
}) {
  const intercomAccounts = () => props.appAccounts.filter((a) => a.appId === "intercom")

  const selectedAccount = () => intercomAccounts().find((a) => a.id === props.config.appAccountId)

  const accountOptions = (): SelectOption<string>[] => {
    const options: SelectOption<string>[] = intercomAccounts().map((a) => {
      const meta = a.metadata as IntercomMetadata | null
      return {
        value: a.id,
        label: meta?.workspaceName ? `${a.name} (${meta.workspaceName})` : a.name,
        icon: (iconProps: { class?: string }) => <AppIcon appId="intercom" class={iconProps.class} />,
      }
    })

    if (props.onAppConnect) {
      options.push({
        value: "__connect_new__",
        label: "Connect new",
        icon: (iconProps: { class?: string }) => <Plus class={iconProps.class} />,
      })
    }

    return options
  }

  const handleChange = (value: string) => {
    if (value === "__connect_new__") {
      props.onAppConnect?.("intercom")
      return
    }
    props.onChange({ appAccountId: value })
  }

  return (
    <div class="flex flex-col gap-3">
      <FormField label="Account">
        <Select
          value={props.config.appAccountId}
          options={accountOptions()}
          onChange={handleChange}
          placeholder="Select an Intercom account"
        />
      </FormField>

      <Show when={selectedAccount()}>
        {(account) => {
          const meta = account().metadata as IntercomMetadata | null
          return (
            <div class="rounded border border-border-muted bg-surface-muted px-2.5 py-2 text-2xs text-text-muted">
              Connected to workspace <span class="font-medium text-text">{meta?.workspaceName ?? account().name}</span>
            </div>
          )
        }}
      </Show>
    </div>
  )
}
