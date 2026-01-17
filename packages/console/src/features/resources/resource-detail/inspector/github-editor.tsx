import { Show } from "solid-js"
import { Plus } from "phosphor-solid-js"
import type { GitHubMetadata } from "@synatra/core/types"
import { Select, FormField, type SelectOption } from "../../../../ui"
import { AppIcon } from "../../../../components"
import type { GitHubEditorConfig } from "../constants"
import type { AppAccounts } from "../../../../app/api"

export function GitHubConfigEditorContent(props: {
  config: GitHubEditorConfig
  appAccounts: AppAccounts
  onChange: (config: GitHubEditorConfig) => void
  onAppConnect?: (appId: string) => void
}) {
  const githubAccounts = () => props.appAccounts.filter((a) => a.appId === "github")

  const selectedAccount = () => githubAccounts().find((a) => a.id === props.config.appAccountId)

  const accountOptions = (): SelectOption<string>[] => {
    const options: SelectOption<string>[] = githubAccounts().map((a) => {
      const meta = a.metadata as GitHubMetadata | null
      return {
        value: a.id,
        label: meta?.accountLogin ? `${a.name} (${meta.accountLogin})` : a.name,
        icon: (iconProps: { class?: string }) => <AppIcon appId="github" class={iconProps.class} />,
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
      props.onAppConnect?.("github")
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
          placeholder="Select a GitHub account"
        />
      </FormField>

      <Show when={selectedAccount()}>
        {(account) => {
          const meta = account().metadata as GitHubMetadata | null
          return (
            <div class="rounded border border-border-muted bg-surface-muted px-2.5 py-2 text-2xs text-text-muted">
              Connected to {meta?.accountType === "Organization" ? "organization" : "user"}{" "}
              <span class="font-medium text-text">{meta?.accountLogin ?? account().name}</span>
            </div>
          )
        }}
      </Show>
    </div>
  )
}
