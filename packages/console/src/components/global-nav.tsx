import { createSignal, For, Show, onCleanup, onMount } from "solid-js"
import { A, useLocation, useNavigate } from "@solidjs/router"
import {
  Tray,
  Gear,
  SignOut,
  Database,
  CircleDashed,
  Note,
  Lightning,
  Moon,
  Sun,
  Plus,
  Check,
  CaretUpDown,
  Keyboard,
  ChatCircleDots,
} from "phosphor-solid-js"
import {
  user,
  signOut,
  memberRole,
  theme,
  toggleTheme,
  vimMode,
  toggleVimMode,
  auth,
  activeOrg,
  activateOrg,
  type Organization,
} from "../app"
import { Tooltip, Avatar } from "../ui"

type NavItem = {
  id: string
  label: string
  href: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
}

const MAIN_ITEMS: NavItem[] = [
  { id: "inbox", label: "Inbox", href: "/inbox", icon: Tray },
  { id: "agents", label: "Agents", href: "/agents", icon: CircleDashed },
  { id: "triggers", label: "Triggers", href: "/triggers", icon: Lightning },
  { id: "prompts", label: "Prompts", href: "/prompts", icon: Note },
  { id: "resources", label: "Resources", href: "/resources", icon: Database },
]

const BOTTOM_ITEMS: NavItem[] = [{ id: "settings", label: "Settings", href: "/settings", icon: Gear }]

const Logo = (props: { size?: number }) => {
  const size = () => props.size ?? 18
  return (
    <svg width={size()} height={size()} viewBox="0 0 1248 1244" xmlns="http://www.w3.org/2000/svg">
      <rect width="1248" height="1244" rx="200" ry="200" fill="currentColor" />
    </svg>
  )
}

type GlobalNavProps = {
  pendingCount?: number
}

type NavLinkProps = {
  item: NavItem
  isActive: boolean
  badge?: number
}

function NavLink(props: NavLinkProps) {
  const Icon = props.item.icon
  return (
    <Tooltip content={props.item.label} side="right">
      <A
        href={props.item.href}
        aria-current={props.isActive ? "page" : undefined}
        aria-label={props.item.label}
        class="group relative flex h-9 w-9 items-center justify-center rounded-lg no-underline transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        classList={{
          "bg-accent/10 text-accent": props.isActive,
          "text-text-muted hover:bg-surface/50 hover:text-text": !props.isActive,
        }}
      >
        <Icon size={18} weight={props.item.id === "agents" ? "duotone" : "regular"} />
        <Show when={props.badge !== undefined && props.badge > 0}>
          <span class="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-medium text-white">
            {props.badge}
          </span>
        </Show>
      </A>
    </Tooltip>
  )
}

function BottomNavLink(props: NavLinkProps) {
  const Icon = props.item.icon
  return (
    <A
      href={props.item.href}
      aria-current={props.isActive ? "page" : undefined}
      aria-label={props.item.label}
      class="group relative flex h-9 w-9 items-center justify-center rounded-lg no-underline transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      classList={{
        "bg-accent/10 text-accent": props.isActive,
        "text-text-muted hover:bg-surface/50 hover:text-text": !props.isActive,
      }}
    >
      <Icon size={18} />
    </A>
  )
}

function OrgSwitcher() {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = createSignal(false)
  const [organizations, setOrganizations] = createSignal<Organization[]>([])
  const [loading, setLoading] = createSignal(true)
  let containerRef: HTMLDivElement | undefined

  const handleClickOutside = (e: MouseEvent) => {
    if (showMenu() && containerRef && !containerRef.contains(e.target as Node)) {
      setShowMenu(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && showMenu()) {
      setShowMenu(false)
    }
  }

  onMount(async () => {
    document.addEventListener("click", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    const { data } = await auth.organization.list()
    if (data) {
      setOrganizations(data as Organization[])
    }
    setLoading(false)
  })

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside)
    document.removeEventListener("keydown", handleKeyDown)
  })

  const selectOrg = async (org: Organization) => {
    const { error } = await auth.organization.setActive({ organizationId: org.id })
    if (error) return
    await activateOrg(org)
    setShowMenu(false)
    window.location.href = "/inbox"
  }

  const currentOrg = () => activeOrg()
  const otherOrgs = () => organizations().filter((o) => o.id !== currentOrg()?.id)

  return (
    <div ref={containerRef} class="relative">
      <Tooltip content={currentOrg()?.name ?? "Synatra"} side="right">
        <button
          type="button"
          aria-label="Switch organization"
          aria-expanded={showMenu()}
          aria-haspopup="menu"
          class="mb-1 flex h-9 w-9 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          onClick={() => setShowMenu(!showMenu())}
        >
          <Logo size={18} />
        </button>
      </Tooltip>

      <Show when={showMenu()}>
        <div class="absolute left-full top-0 z-50 ml-1 w-52 rounded-lg border border-border bg-surface-floating shadow-lg">
          <div class="p-1">
            <div class="px-2 py-1 text-2xs font-medium text-text-muted">Organizations</div>
            <Show when={currentOrg()}>
              <div class="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-text">
                <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent text-[10px] font-medium text-white">
                  {currentOrg()!.name.charAt(0).toUpperCase()}
                </div>
                <span class="truncate font-medium">{currentOrg()!.name}</span>
                <Check size={14} class="ml-auto shrink-0 text-accent" />
              </div>
            </Show>

            <For each={otherOrgs()}>
              {(org) => (
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text"
                  onClick={() => selectOrg(org)}
                >
                  <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-muted text-[10px] font-medium text-text-muted">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <span class="truncate">{org.name}</span>
                </button>
              )}
            </For>

            <div class="my-1 border-t border-border" />
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text"
              onClick={() => {
                setShowMenu(false)
                navigate("/organizations/new")
              }}
            >
              <Plus size={14} />
              New organization
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}

function UserMenu() {
  const [showMenu, setShowMenu] = createSignal(false)
  let containerRef: HTMLDivElement | undefined

  const handleClickOutside = (e: MouseEvent) => {
    if (showMenu() && containerRef && !containerRef.contains(e.target as Node)) {
      setShowMenu(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && showMenu()) {
      setShowMenu(false)
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
  })

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside)
    document.removeEventListener("keydown", handleKeyDown)
  })

  return (
    <div ref={containerRef} class="relative">
      <button
        type="button"
        aria-label="User menu"
        aria-expanded={showMenu()}
        aria-haspopup="menu"
        class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        onClick={() => setShowMenu(!showMenu())}
      >
        <Avatar size="sm" variant="accent" fallback={user()?.name || user()?.email || ""} />
      </button>

      <Show when={showMenu()}>
        <div class="absolute bottom-full left-0 z-50 mb-1 w-48 rounded-lg border border-border bg-surface-floating shadow-lg">
          <div class="p-1">
            <div class="px-2 py-1.5 text-xs text-text-muted">{user()?.email}</div>
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text"
              onClick={() => toggleTheme()}
            >
              {theme() === "light" ? <Moon size={14} /> : <Sun size={14} />}
              {theme() === "light" ? "Dark mode" : "Light mode"}
            </button>
            <Show when={memberRole() !== "member"}>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text"
                onClick={() => toggleVimMode()}
              >
                <Keyboard size={14} />
                Vim mode: {vimMode() ? "On" : "Off"}
              </button>
            </Show>
            <a
              href="https://github.com/synatrahq/synatra/discussions"
              target="_blank"
              rel="noopener noreferrer"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text"
            >
              <ChatCircleDots size={14} />
              Feedback
            </a>
            <div class="my-1 border-t border-border" />
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text"
              onClick={() => {
                setShowMenu(false)
                signOut()
              }}
            >
              <SignOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}

const BUILDER_ONLY_IDS = new Set(["agents", "triggers", "prompts", "resources"])
const ADMIN_ONLY_IDS = new Set(["settings"])

export function GlobalNav(props: GlobalNavProps) {
  const location = useLocation()

  const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(`${href}/`)

  const pendingCount = () => props.pendingCount ?? 0

  const canView = (id: string) => {
    const role = memberRole()
    if (ADMIN_ONLY_IDS.has(id)) return role === "owner" || role === "admin"
    if (BUILDER_ONLY_IDS.has(id)) return role !== "member"
    return true
  }

  const mainItems = () => MAIN_ITEMS.filter((item) => canView(item.id))
  const bottomItems = () => BOTTOM_ITEMS.filter((item) => canView(item.id))

  return (
    <nav
      aria-label="Main navigation"
      class="flex h-full w-11 shrink-0 flex-col justify-between border-r border-border bg-surface-muted py-2"
    >
      <div class="flex flex-col items-center gap-0.5">
        <OrgSwitcher />

        <For each={mainItems()}>
          {(item) => (
            <NavLink
              item={item}
              isActive={isActive(item.href)}
              badge={item.id === "inbox" ? pendingCount() : undefined}
            />
          )}
        </For>
      </div>

      <div class="flex flex-col items-center gap-0.5">
        <For each={bottomItems()}>{(item) => <BottomNavLink item={item} isActive={isActive(item.href)} />}</For>
        <UserMenu />
      </div>
    </nav>
  )
}
