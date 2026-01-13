import { For } from "solid-js"
import { A, useLocation } from "@solidjs/router"
import { TreeStructure, Users, Plugs, Cube, ChartBar, CreditCard } from "phosphor-solid-js"
import type { JSX } from "solid-js"

type NavItem = {
  id: string
  label: string
  href: string
  icon: (props: { class?: string }) => JSX.Element
}

const navItems: NavItem[] = [
  {
    id: "users",
    label: "Users",
    href: "/settings/users",
    icon: (props) => <Users class={props.class} />,
  },
  {
    id: "environments",
    label: "Environments",
    href: "/settings/environments",
    icon: (props) => <TreeStructure class={props.class} />,
  },
  {
    id: "connectors",
    label: "Connectors",
    href: "/settings/connectors",
    icon: (props) => <Plugs class={props.class} />,
  },
  {
    id: "apps",
    label: "Apps",
    href: "/settings/apps",
    icon: (props) => <Cube class={props.class} />,
  },
  {
    id: "usage",
    label: "Usage",
    href: "/settings/usage",
    icon: (props) => <ChartBar class={props.class} />,
  },
  {
    id: "billing",
    label: "Billing",
    href: "/settings/billing",
    icon: (props) => <CreditCard class={props.class} />,
  },
]

export function SettingsSidebar() {
  const location = useLocation()
  const isActive = (href: string) => location.pathname === href

  return (
    <div class="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div class="flex items-center px-3 pb-2 pt-3">
        <span class="text-xs font-medium text-text">Settings</span>
      </div>
      <div class="flex-1 overflow-y-auto px-1.5 pb-1.5 scrollbar-thin">
        <div class="flex flex-col gap-0.5">
          <For each={navItems}>
            {(item) => {
              const active = () => isActive(item.href)
              return (
                <A
                  href={item.href}
                  class="group relative flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                  classList={{
                    "bg-surface-muted text-text": active(),
                    "text-text-secondary hover:bg-surface-muted hover:text-text": !active(),
                  }}
                >
                  <item.icon class="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </A>
              )
            }}
          </For>
        </div>
      </div>
    </div>
  )
}
