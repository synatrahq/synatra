import { Show } from "solid-js"
import { Input, Select, RadioGroup, FormField } from "../../../../ui"
import type { RestApiEditorConfig } from "../constants"
import { AUTH_TYPE_OPTIONS, API_KEY_LOCATION_OPTIONS } from "./constants"
import { SensitiveInput, KeyValueList } from "./shared"

export function RestApiConfigEditorContent(props: {
  config: RestApiEditorConfig
  onChange: (config: RestApiEditorConfig) => void
}) {
  return (
    <div class="flex flex-col gap-3">
      <FormField label="Base URL">
        <Input
          type="text"
          value={props.config.baseUrl}
          placeholder="https://api.example.com"
          onInput={(e) => props.onChange({ ...props.config, baseUrl: e.currentTarget.value })}
          class="font-code"
        />
      </FormField>

      <FormField label="Authentication">
        <Select
          value={props.config.authType}
          options={AUTH_TYPE_OPTIONS}
          onChange={(v) =>
            props.onChange({
              ...props.config,
              authType: v as RestApiEditorConfig["authType"],
              apiKeyLocation: v === "api_key" ? (props.config.apiKeyLocation ?? "header") : undefined,
              apiKeyName: v === "api_key" ? (props.config.apiKeyName ?? "X-API-Key") : undefined,
            })
          }
        />
      </FormField>

      <Show when={props.config.authType === "api_key"}>
        <FormField label="API Key">
          <SensitiveInput
            type="password"
            value={props.config.apiKeyValue}
            placeholder="your-api-key"
            onChange={(v) => props.onChange({ ...props.config, apiKeyValue: v })}
            class="font-code"
          />
        </FormField>
        <FormField label="Location">
          <RadioGroup
            value={props.config.apiKeyLocation ?? "header"}
            options={API_KEY_LOCATION_OPTIONS}
            onChange={(v) => props.onChange({ ...props.config, apiKeyLocation: v as "header" | "query" })}
          />
        </FormField>
        <FormField label={props.config.apiKeyLocation === "query" ? "Parameter Name" : "Header Name"}>
          <Input
            type="text"
            value={props.config.apiKeyName ?? ""}
            placeholder={props.config.apiKeyLocation === "query" ? "api_key" : "X-API-Key"}
            onInput={(e) => props.onChange({ ...props.config, apiKeyName: e.currentTarget.value })}
            class="font-code"
          />
        </FormField>
      </Show>

      <Show when={props.config.authType === "bearer"}>
        <FormField label="Bearer Token">
          <SensitiveInput
            type="password"
            value={props.config.bearerToken}
            placeholder="your-token"
            onChange={(v) => props.onChange({ ...props.config, bearerToken: v })}
            class="font-code"
          />
        </FormField>
      </Show>

      <Show when={props.config.authType === "basic"}>
        <div class="grid grid-cols-2 gap-2">
          <FormField label="Username">
            <Input
              type="text"
              value={props.config.basicUsername}
              placeholder="username"
              onInput={(e) => props.onChange({ ...props.config, basicUsername: e.currentTarget.value })}
            />
          </FormField>
          <FormField label="Password">
            <SensitiveInput
              type="password"
              value={props.config.basicPassword}
              onChange={(v) => props.onChange({ ...props.config, basicPassword: v })}
            />
          </FormField>
        </div>
      </Show>

      <FormField label="Headers">
        <KeyValueList
          items={props.config.headers}
          onChange={(headers) => props.onChange({ ...props.config, headers })}
          keyPlaceholder="Header name"
          valuePlaceholder="Header value"
        />
      </FormField>

      <FormField label="Query Parameters">
        <KeyValueList
          items={props.config.queryParams}
          onChange={(queryParams) => props.onChange({ ...props.config, queryParams })}
          keyPlaceholder="Parameter name"
          valuePlaceholder="Parameter value"
        />
      </FormField>
    </div>
  )
}
