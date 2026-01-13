import { Show } from "solid-js"
import { Sparkle } from "phosphor-solid-js"
import { theme } from "../app"
import postgresIcon from "../assets/images/postgres.svg"
import mysqlIcon from "../assets/images/mysql.svg"
import firebaseIcon from "../assets/images/firebase.svg"
import graphqlIcon from "../assets/images/graphql.svg"
import javascriptIcon from "../assets/images/javascript.svg"
import mongodbIcon from "../assets/images/mongodb.svg"
import restapiIcon from "../assets/images/restapi.svg"
import stripeIcon from "../assets/images/stripe.svg"
import githubLight from "../assets/images/github_light.svg"
import githubDark from "../assets/images/github_dark.svg"
import intercomLight from "../assets/images/intercom_light.svg"
import intercomDark from "../assets/images/intercom_dark.svg"
import type { ResourceType } from "@synatra/core/types"

type IconConfig = string | { light: string; dark: string }

const RESOURCE_ICONS: Record<ResourceType | string, IconConfig> = {
  postgres: postgresIcon,
  mysql: mysqlIcon,
  firebase: firebaseIcon,
  graphql: graphqlIcon,
  javascript: javascriptIcon,
  mongodb: mongodbIcon,
  restapi: restapiIcon,
  stripe: stripeIcon,
  github: { light: githubLight, dark: githubDark },
  intercom: { light: intercomLight, dark: intercomDark },
}

const RESOURCE_LABELS: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  firebase: "Firebase",
  graphql: "GraphQL",
  javascript: "JavaScript",
  mongodb: "MongoDB",
  restapi: "REST API",
  stripe: "Stripe",
  github: "GitHub",
  intercom: "Intercom",
  synatra_ai: "Synatra AI",
}

function resolveIcon(config: IconConfig): string {
  if (typeof config === "string") return config
  return theme() === "dark" ? config.dark : config.light
}

export function ResourceIcon(props: { type: ResourceType | string; class?: string }) {
  const config = () => RESOURCE_ICONS[props.type]
  const label = () => RESOURCE_LABELS[props.type] ?? props.type
  return (
    <Show
      when={props.type !== "synatra_ai"}
      fallback={<Sparkle class={`text-violet-500 ${props.class ?? "h-4 w-4"}`} weight="fill" />}
    >
      <img src={resolveIcon(config() ?? RESOURCE_ICONS.restapi)} alt={label()} class={props.class} />
    </Show>
  )
}

export function ResourceIconContainer(props: { type: ResourceType | string; class?: string; iconClass?: string }) {
  const isSynatraAi = () => props.type === "synatra_ai"
  const containerClass = () => props.class ?? "flex h-6 w-6 items-center justify-center rounded"
  const iconClass = () => props.iconClass ?? (isSynatraAi() ? "h-3.5 w-3.5" : "h-4 w-4")

  return (
    <div
      class={`${containerClass()} ${isSynatraAi() ? "" : "bg-surface-muted"}`}
      style={isSynatraAi() ? { "background-color": "color-mix(in srgb, #8b5cf6 15%, transparent)" } : undefined}
    >
      <Show when={!isSynatraAi()} fallback={<Sparkle class={`text-violet-500 ${iconClass()}`} weight="fill" />}>
        <ResourceIcon type={props.type} class={iconClass()} />
      </Show>
    </div>
  )
}
