import { Show } from "solid-js"
import { Input, Checkbox, RadioGroup, FileInput, FormField } from "../../../../ui"
import type { DatabaseEditorConfig } from "../constants"
import { SSL_OPTIONS, validatePemCertificate, validatePemPrivateKey } from "./constants"
import { SensitiveInput } from "./shared"

export function DatabaseConfigEditorContent(props: {
  config: DatabaseEditorConfig
  type: "postgres" | "mysql"
  onChange: (config: DatabaseEditorConfig) => void
}) {
  return (
    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-2">
        <FormField label="Host">
          <Input
            type="text"
            value={props.config.host}
            onInput={(e) => props.onChange({ ...props.config, host: e.currentTarget.value })}
            placeholder="localhost"
          />
        </FormField>
        <FormField label="Port">
          <Input
            type="text"
            value={String(props.config.port)}
            onInput={(e) =>
              props.onChange({
                ...props.config,
                port: parseInt(e.currentTarget.value) || (props.type === "mysql" ? 3306 : 5432),
              })
            }
          />
        </FormField>
      </div>

      <FormField label="Database">
        <Input
          type="text"
          value={props.config.database}
          onInput={(e) => props.onChange({ ...props.config, database: e.currentTarget.value })}
          placeholder="myapp"
        />
      </FormField>

      <div class="grid grid-cols-2 gap-2">
        <FormField label="Username">
          <Input
            type="text"
            value={props.config.user}
            onInput={(e) => props.onChange({ ...props.config, user: e.currentTarget.value })}
            placeholder={props.type === "mysql" ? "root" : "postgres"}
          />
        </FormField>
        <FormField label="Password">
          <SensitiveInput
            type="password"
            value={props.config.password}
            onChange={(v) => props.onChange({ ...props.config, password: v })}
          />
        </FormField>
      </div>

      <Checkbox
        checked={props.config.ssl}
        onChange={(e) => props.onChange({ ...props.config, ssl: e.currentTarget.checked })}
        label="Enable SSL"
      />

      <Show when={props.config.ssl}>
        <FormField label="SSL verification">
          <RadioGroup
            value={props.config.sslVerification ?? "full"}
            options={SSL_OPTIONS}
            onChange={(value) =>
              props.onChange({ ...props.config, sslVerification: value as "full" | "verify_ca" | "skip_ca" })
            }
          />
        </FormField>

        <FormField label="CA certificate">
          <FileInput
            value={props.config.caCertificate}
            filename={props.config.caCertificateFilename}
            accept=".pem,.crt,.cer"
            placeholder="Upload CA certificate"
            onValidate={validatePemCertificate}
            onChange={(content, filename) =>
              props.onChange({
                ...props.config,
                caCertificate: content,
                caCertificateFilename: filename,
              })
            }
          />
        </FormField>

        <FormField label="Client certificate">
          <FileInput
            value={props.config.clientCertificate}
            filename={props.config.clientCertificateFilename}
            accept=".pem,.crt,.cer"
            placeholder="Upload client certificate"
            onValidate={validatePemCertificate}
            onChange={(content, filename) =>
              props.onChange({
                ...props.config,
                clientCertificate: content,
                clientCertificateFilename: filename,
              })
            }
          />
        </FormField>

        <FormField label="Client key">
          <FileInput
            value={props.config.clientKey}
            filename={props.config.clientKeyFilename}
            accept=".pem,.key"
            placeholder="Upload client key"
            onValidate={validatePemPrivateKey}
            onChange={(content, filename) =>
              props.onChange({
                ...props.config,
                clientKey: content,
                clientKeyFilename: filename,
              })
            }
          />
        </FormField>
      </Show>
    </div>
  )
}
