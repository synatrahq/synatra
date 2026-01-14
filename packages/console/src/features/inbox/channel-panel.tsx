import { Show, For, createSignal, createEffect } from "solid-js"
import { Plus, Crown, DotsThree, Robot, MagnifyingGlass, User, Archive, ArrowCounterClockwise } from "phosphor-solid-js"
import {
  Modal,
  ModalContainer,
  ModalHeader,
  ModalBody,
  Avatar,
  IconButton,
  Button,
  DropdownMenu,
  Badge,
  Skeleton,
  Input,
  Textarea,
  Spinner,
  Checkbox,
  type DropdownMenuItem,
} from "../../ui"
import { EntityIcon } from "../../components"
import type { ChannelMembers, ChannelAgents, Agents } from "../../app/api"
import { auth, api } from "../../app"

type Tab = "general" | "members" | "agents"

type ChannelPanelProps = {
  open: boolean
  channelId: string
  channelName: string
  channelSlug: string
  channelDescription: string | null
  archived: boolean
  members: ChannelMembers
  agents: ChannelAgents
  currentUserId: string
  isOwner: boolean
  membersLoading: boolean
  agentsLoading: boolean
  onClose: () => void
  onAddMembers: (memberIds: string[]) => Promise<void>
  onRemoveMember: (memberId: string) => void
  onUpdateRole: (memberId: string, role: "owner" | "member") => void
  onAddAgents: (agentIds: string[]) => Promise<void>
  onRemoveAgent: (agentId: string) => void
  onSave: (data: { name: string; description?: string }) => Promise<void>
  onArchive: () => Promise<void>
  onUnarchive: () => Promise<void>
  saving?: boolean
}

function TabButton(props: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      class="relative px-2.5 py-1.5 text-xs font-medium transition-colors"
      classList={{
        "text-text": props.active,
        "text-text-muted hover:text-text": !props.active,
      }}
      onClick={props.onClick}
    >
      <span class="flex items-center gap-1">
        {props.label}
        <Show when={typeof props.count === "number"}>
          <span class="text-2xs text-text-muted">{props.count}</span>
        </Show>
      </span>
      <Show when={props.active}>
        <span class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
      </Show>
    </button>
  )
}

function ListSkeleton() {
  return (
    <div class="flex items-center gap-2 px-2.5 py-1">
      <Skeleton class="h-5 w-5 rounded-md" />
      <Skeleton class="h-3 w-24" />
    </div>
  )
}

type OrgMember = {
  id: string
  userId: string
  role: string
  user: { id: string; name: string | null; email: string; image: string | null }
}

export function ChannelPanel(props: ChannelPanelProps) {
  const [tab, setTab] = createSignal<Tab>("members")
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [error, setError] = createSignal<string | null>(null)
  const [archiving, setArchiving] = createSignal(false)
  const [addingMember, setAddingMember] = createSignal(false)
  const [addingAgent, setAddingAgent] = createSignal(false)
  const [memberSearch, setMemberSearch] = createSignal("")
  const [agentSearch, setAgentSearch] = createSignal("")
  const [orgMembers, setOrgMembers] = createSignal<OrgMember[]>([])
  const [orgAgents, setOrgAgents] = createSignal<Agents>([])
  const [loadingOrgMembers, setLoadingOrgMembers] = createSignal(false)
  const [loadingOrgAgents, setLoadingOrgAgents] = createSignal(false)
  const [selectedMemberIds, setSelectedMemberIds] = createSignal<Set<string>>(new Set())
  const [selectedAgentIds, setSelectedAgentIds] = createSignal<Set<string>>(new Set())

  createEffect(() => {
    if (props.open) {
      setName(props.channelName)
      setDescription(props.channelDescription ?? "")
      setError(null)
      setAddingMember(false)
      setAddingAgent(false)
      setMemberSearch("")
      setAgentSearch("")
      setSelectedMemberIds(new Set<string>())
      setSelectedAgentIds(new Set<string>())
    }
  })

  const fetchOrgMembers = async () => {
    setLoadingOrgMembers(true)
    try {
      const { data } = await auth.organization.listMembers()
      if (data) {
        setOrgMembers(
          data.members.map((m) => ({
            id: m.id,
            userId: m.userId,
            role: m.role,
            user: { id: m.user.id, name: m.user.name, email: m.user.email, image: m.user.image ?? null },
          })),
        )
      }
    } catch (e) {
      console.error("Failed to fetch members", e)
    } finally {
      setLoadingOrgMembers(false)
    }
  }

  const fetchOrgAgents = async () => {
    setLoadingOrgAgents(true)
    try {
      const res = await api.api.agents.$get()
      if (res.ok) {
        const data = await res.json()
        setOrgAgents(data)
      }
    } catch (e) {
      console.error("Failed to fetch agents", e)
    } finally {
      setLoadingOrgAgents(false)
    }
  }

  const handleStartAddMember = () => {
    setAddingMember(true)
    setMemberSearch("")
    setSelectedMemberIds(new Set<string>())
    fetchOrgMembers()
  }

  const handleStartAddAgent = () => {
    setAddingAgent(true)
    setAgentSearch("")
    setSelectedAgentIds(new Set<string>())
    fetchOrgAgents()
  }

  const handleAddMembers = async () => {
    const ids = Array.from(selectedMemberIds())
    if (ids.length === 0) return
    setError(null)
    try {
      await props.onAddMembers(ids)
      setAddingMember(false)
      setSelectedMemberIds(new Set<string>())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add members")
    }
  }

  const handleAddAgents = async () => {
    const ids = Array.from(selectedAgentIds())
    if (ids.length === 0) return
    setError(null)
    try {
      await props.onAddAgents(ids)
      setAddingAgent(false)
      setSelectedAgentIds(new Set<string>())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add agents")
    }
  }

  const toggleMember = (id: string) => {
    const current = new Set(selectedMemberIds())
    if (current.has(id)) {
      current.delete(id)
    } else {
      current.add(id)
    }
    setSelectedMemberIds(current)
  }

  const toggleAgent = (id: string) => {
    const current = new Set(selectedAgentIds())
    if (current.has(id)) {
      current.delete(id)
    } else {
      current.add(id)
    }
    setSelectedAgentIds(current)
  }

  const selectAllMembers = () => {
    const filtered = filteredAvailableMembers()
    const current = new Set(selectedMemberIds())
    const allSelected = filtered.every((m) => current.has(m.id))
    if (allSelected) {
      filtered.forEach((m) => current.delete(m.id))
    } else {
      filtered.forEach((m) => current.add(m.id))
    }
    setSelectedMemberIds(current)
  }

  const selectAllAgents = () => {
    const filtered = filteredAvailableAgents()
    const current = new Set(selectedAgentIds())
    const allSelected = filtered.every((a) => current.has(a.id))
    if (allSelected) {
      filtered.forEach((a) => current.delete(a.id))
    } else {
      filtered.forEach((a) => current.add(a.id))
    }
    setSelectedAgentIds(current)
  }

  const allMembersSelected = () => {
    const filtered = filteredAvailableMembers()
    if (filtered.length === 0) return false
    return filtered.every((m) => selectedMemberIds().has(m.id))
  }

  const allAgentsSelected = () => {
    const filtered = filteredAvailableAgents()
    if (filtered.length === 0) return false
    return filtered.every((a) => selectedAgentIds().has(a.id))
  }

  const handleSave = async () => {
    if (!name().trim()) {
      setError("Name is required")
      return
    }
    try {
      await props.onSave({ name: name().trim(), description: description().trim() || undefined })
      props.onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    }
  }

  const handleArchive = async () => {
    setArchiving(true)
    try {
      if (props.archived) {
        await props.onUnarchive()
      } else {
        await props.onArchive()
      }
      props.onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setArchiving(false)
    }
  }

  const hasChanges = () => {
    return name() !== props.channelName || description() !== (props.channelDescription ?? "")
  }

  const sortedMembers = () => {
    return [...props.members].sort((a, b) => {
      if (a.role === "owner" && b.role !== "owner") return -1
      if (a.role !== "owner" && b.role === "owner") return 1
      const nameA = a.user.name ?? a.user.email
      const nameB = b.user.name ?? b.user.email
      return nameA.localeCompare(nameB)
    })
  }

  const sortedAgents = () => [...props.agents].sort((a, b) => a.agent.name.localeCompare(b.agent.name))

  const availableMembers = () => {
    const existing = new Set(props.members.map((m) => m.memberId))
    return orgMembers().filter((m) => !existing.has(m.id))
  }

  const filteredAvailableMembers = () => {
    const query = memberSearch().toLowerCase()
    if (!query) return availableMembers()
    return availableMembers().filter(
      (m) => m.user.name?.toLowerCase().includes(query) || m.user.email.toLowerCase().includes(query),
    )
  }

  const availableAgents = () => {
    const existing = new Set(props.agents.map((a) => a.agentId))
    return orgAgents().filter((a) => !existing.has(a.id))
  }

  const filteredAvailableAgents = () => {
    const query = agentSearch().toLowerCase()
    if (!query) return availableAgents()
    return availableAgents().filter((a) => a.name.toLowerCase().includes(query) || a.slug.toLowerCase().includes(query))
  }

  const isAdding = () => addingMember() || addingAgent()
  const headerTitle = () => {
    if (addingMember()) return "Add member"
    if (addingAgent()) return "Add agent"
    return `# ${props.channelName}`
  }
  const handleBack = () => {
    setAddingMember(false)
    setAddingAgent(false)
    setError(null)
  }

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <ModalHeader title={headerTitle()} onClose={props.onClose} onBack={isAdding() ? handleBack : undefined} />

        <Show when={!isAdding()}>
          <div class="flex border-b border-border px-1">
            <TabButton
              active={tab() === "members"}
              label="Members"
              count={props.members.length}
              onClick={() => setTab("members")}
            />
            <TabButton
              active={tab() === "agents"}
              label="Agents"
              count={props.agents.length}
              onClick={() => setTab("agents")}
            />
            <Show when={props.isOwner}>
              <TabButton active={tab() === "general"} label="Settings" onClick={() => setTab("general")} />
            </Show>
          </div>
        </Show>

        <Show when={tab() === "members"}>
          <Show
            when={!addingMember()}
            fallback={
              <AddMemberView
                loading={loadingOrgMembers()}
                members={filteredAvailableMembers()}
                allAdded={availableMembers().length === 0}
                search={memberSearch()}
                onSearchChange={setMemberSearch}
                selectedIds={selectedMemberIds()}
                onToggle={toggleMember}
                onSelectAll={selectAllMembers}
                allSelected={allMembersSelected()}
                onCancel={() => setAddingMember(false)}
                onAdd={handleAddMembers}
                error={error()}
              />
            }
          >
            <ModalBody class="p-0">
              <div class="h-[280px] overflow-y-auto py-1">
                <Show when={props.isOwner}>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-2.5 py-1 text-left transition-colors hover:bg-surface-muted"
                    onClick={handleStartAddMember}
                  >
                    <span class="flex h-5 w-5 items-center justify-center rounded-md border border-dashed border-border">
                      <Plus class="h-2.5 w-2.5 text-text-muted" />
                    </span>
                    <span class="text-xs text-text-muted">Add member</span>
                  </button>
                </Show>

                <Show when={props.membersLoading}>
                  <ListSkeleton />
                  <ListSkeleton />
                  <ListSkeleton />
                </Show>

                <Show when={!props.membersLoading}>
                  <For each={sortedMembers()}>
                    {(member) => (
                      <MemberRow
                        member={member}
                        isCurrentUser={member.user.id === props.currentUserId}
                        canManage={props.isOwner && member.user.id !== props.currentUserId}
                        onUpdateRole={(role) => props.onUpdateRole(member.memberId, role)}
                        onRemove={() => props.onRemoveMember(member.memberId)}
                      />
                    )}
                  </For>
                </Show>
              </div>
            </ModalBody>
          </Show>
        </Show>

        <Show when={tab() === "agents"}>
          <Show
            when={!addingAgent()}
            fallback={
              <AddAgentView
                loading={loadingOrgAgents()}
                agents={filteredAvailableAgents()}
                allAdded={availableAgents().length === 0}
                search={agentSearch()}
                onSearchChange={setAgentSearch}
                selectedIds={selectedAgentIds()}
                onToggle={toggleAgent}
                onSelectAll={selectAllAgents}
                allSelected={allAgentsSelected()}
                onCancel={() => setAddingAgent(false)}
                onAdd={handleAddAgents}
                error={error()}
              />
            }
          >
            <ModalBody class="p-0">
              <div class="h-[280px] overflow-y-auto py-1">
                <Show when={props.isOwner}>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-2.5 py-1 text-left transition-colors hover:bg-surface-muted"
                    onClick={handleStartAddAgent}
                  >
                    <span class="flex h-5 w-5 items-center justify-center rounded-md border border-dashed border-border">
                      <Plus class="h-2.5 w-2.5 text-text-muted" />
                    </span>
                    <span class="text-xs text-text-muted">Add agent</span>
                  </button>
                </Show>

                <Show when={props.agentsLoading}>
                  <ListSkeleton />
                  <ListSkeleton />
                  <ListSkeleton />
                </Show>

                <Show when={!props.agentsLoading}>
                  <For each={sortedAgents()}>
                    {(item) => (
                      <AgentRow
                        agent={item}
                        canManage={props.isOwner}
                        onRemove={() => props.onRemoveAgent(item.agentId)}
                      />
                    )}
                  </For>
                </Show>
              </div>
            </ModalBody>
          </Show>
        </Show>

        <Show when={tab() === "general"}>
          <ModalBody class="p-0">
            <div class="h-[280px] overflow-y-auto p-3">
              <div class="space-y-3">
                <div class="flex items-center gap-3">
                  <label class="w-16 shrink-0 text-xs text-text-muted">Name</label>
                  <Input
                    type="text"
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                    placeholder="Channel name"
                    class="flex-1"
                  />
                </div>
                <div class="flex items-start gap-3">
                  <label class="w-16 shrink-0 pt-1.5 text-xs text-text-muted">Description</label>
                  <Textarea
                    value={description()}
                    onInput={(e) => setDescription(e.currentTarget.value)}
                    placeholder="What is this channel for?"
                    rows={2}
                    class="flex-1"
                  />
                </div>
                <div class="flex items-center gap-3">
                  <label class="w-16 shrink-0 text-xs text-text-muted">Slug</label>
                  <span class="font-code text-xs text-text-muted">{props.channelSlug}</span>
                </div>

                <div class="flex justify-end">
                  <Button variant="default" size="sm" onClick={handleSave} disabled={props.saving || !hasChanges()}>
                    {props.saving && <Spinner size="xs" class="border-white border-t-transparent" />}
                    Save
                  </Button>
                </div>

                <Show when={error()}>
                  <div class="rounded border border-danger bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
                    {error()}
                  </div>
                </Show>

                <div class="border-t border-border pt-3">
                  <div class="flex items-center justify-between rounded border border-danger/30 bg-danger/5 px-2.5 py-2">
                    <div class="flex items-center gap-2">
                      <Show when={props.archived} fallback={<Archive class="h-3.5 w-3.5 text-danger" />}>
                        <ArrowCounterClockwise class="h-3.5 w-3.5 text-text-muted" />
                      </Show>
                      <div>
                        <p class="text-xs font-medium text-text">
                          {props.archived ? "Unarchive channel" : "Archive channel"}
                        </p>
                        <p class="text-2xs text-text-muted">
                          {props.archived ? "Restore visibility" : "Hide from active list"}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={props.archived ? "default" : "destructive"}
                      size="sm"
                      onClick={handleArchive}
                      disabled={archiving()}
                    >
                      {archiving() ? <Spinner size="xs" /> : props.archived ? "Unarchive" : "Archive"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </ModalBody>
        </Show>
      </ModalContainer>
    </Modal>
  )
}

function MemberRow(props: {
  member: ChannelMembers[number]
  isCurrentUser: boolean
  canManage: boolean
  onUpdateRole: (role: "owner" | "member") => void
  onRemove: () => void
}) {
  const menuItems: DropdownMenuItem[] = []
  if (props.canManage) {
    if (props.member.role === "owner") {
      menuItems.push({ type: "item", label: "Remove as owner", onClick: () => props.onUpdateRole("member") })
    } else {
      menuItems.push({ type: "item", label: "Make owner", onClick: () => props.onUpdateRole("owner") })
    }
    menuItems.push({ type: "separator" })
    menuItems.push({ type: "item", label: "Remove", onClick: props.onRemove, variant: "danger" })
  }

  return (
    <div class="group flex h-7 items-center gap-2 px-2.5 hover:bg-surface-muted transition-colors">
      <Avatar
        size="xs"
        src={props.member.user.image ?? undefined}
        alt={props.member.user.name ?? props.member.user.email}
        fallback={props.member.user.name ?? props.member.user.email}
      />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-text truncate">{props.member.user.name ?? props.member.user.email}</span>
          <Show when={props.member.role === "owner"}>
            <Badge variant="secondary" class="gap-0.5 text-2xs py-0 px-1">
              <Crown class="h-2 w-2" weight="fill" />
              Owner
            </Badge>
          </Show>
          <Show when={props.isCurrentUser}>
            <span class="text-2xs text-text-muted">(you)</span>
          </Show>
        </div>
      </div>
      <Show when={props.canManage}>
        <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu
            items={menuItems}
            trigger={
              <IconButton variant="ghost" size="xs" class="text-text-muted hover:text-text">
                <DotsThree class="h-3.5 w-3.5" weight="bold" />
              </IconButton>
            }
          />
        </div>
      </Show>
    </div>
  )
}

function AgentRow(props: { agent: ChannelAgents[number]; canManage: boolean; onRemove: () => void }) {
  const menuItems: DropdownMenuItem[] = props.canManage
    ? [{ type: "item", label: "Remove", onClick: props.onRemove, variant: "danger" }]
    : []

  return (
    <div class="group flex h-7 items-center gap-2 px-2.5 hover:bg-surface-muted transition-colors">
      <EntityIcon
        icon={props.agent.agent.icon}
        iconColor={props.agent.agent.iconColor}
        size={20}
        rounded="md"
        iconScale={0.55}
        fallback={Robot}
      />
      <div class="flex-1 min-w-0">
        <p class="text-xs text-text truncate">{props.agent.agent.name}</p>
      </div>
      <Show when={props.canManage}>
        <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu
            items={menuItems}
            trigger={
              <IconButton variant="ghost" size="xs" class="text-text-muted hover:text-text">
                <DotsThree class="h-3.5 w-3.5" weight="bold" />
              </IconButton>
            }
          />
        </div>
      </Show>
    </div>
  )
}

function EmptyState(props: { icon: typeof User; title: string; description: string }) {
  return (
    <div class="flex flex-col items-center justify-center gap-2 py-8 px-3">
      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted">
        <props.icon class="h-4 w-4 text-text-muted" weight="duotone" />
      </div>
      <div class="text-center">
        <p class="text-xs font-medium text-text">{props.title}</p>
        <p class="text-2xs text-text-muted">{props.description}</p>
      </div>
    </div>
  )
}

function AddMemberView(props: {
  loading: boolean
  members: OrgMember[]
  allAdded: boolean
  search: string
  onSearchChange: (v: string) => void
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  allSelected: boolean
  onCancel: () => void
  onAdd: () => void
  error: string | null
}) {
  return (
    <>
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
        <div class="relative flex-1">
          <MagnifyingGlass class="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-muted" />
          <Input
            type="text"
            placeholder="Search user"
            value={props.search}
            onInput={(e) => props.onSearchChange(e.currentTarget.value)}
            class="w-full pl-7 h-6 text-xs"
          />
        </div>
        <Show when={!props.loading && props.members.length > 0}>
          <button
            type="button"
            class="shrink-0 text-xs text-accent hover:text-accent-hover transition-colors"
            onClick={props.onSelectAll}
          >
            {props.allSelected ? "Deselect all" : "Select all"}
          </button>
        </Show>
      </div>
      <ModalBody class="p-0">
        <div class="h-[200px] overflow-y-auto scrollbar-thin">
          <Show when={props.loading}>
            <ListSkeleton />
            <ListSkeleton />
            <ListSkeleton />
          </Show>

          <Show when={!props.loading && props.allAdded}>
            <EmptyState icon={User} title="All added" description="All members are in this channel" />
          </Show>

          <Show when={!props.loading && !props.allAdded && props.members.length === 0}>
            <EmptyState icon={User} title="No results" description="No members match your search" />
          </Show>

          <Show when={!props.loading && props.members.length > 0}>
            <For each={props.members}>
              {(member) => {
                const selected = () => props.selectedIds.has(member.id)
                return (
                  <button
                    type="button"
                    class="flex h-[34px] w-full items-center gap-2.5 px-3 text-left transition-colors hover:bg-surface-muted"
                    onClick={() => props.onToggle(member.id)}
                  >
                    <Checkbox checked={selected()} class="pointer-events-none" />
                    <Avatar
                      size="xs"
                      src={member.user.image ?? undefined}
                      alt={member.user.name ?? member.user.email}
                      fallback={member.user.name ?? member.user.email}
                    />
                    <span class="text-xs text-text truncate">{member.user.name ?? member.user.email}</span>
                    <Show when={member.user.name}>
                      <span class="text-xs text-text-muted truncate">({member.user.email})</span>
                    </Show>
                  </button>
                )
              }}
            </For>
          </Show>
        </div>
      </ModalBody>

      <Show when={props.error}>
        <div class="px-3 py-2 border-t border-border">
          <p class="text-xs text-danger">{props.error}</p>
        </div>
      </Show>

      <div class="flex items-center justify-between border-t border-border px-3 py-2 bg-surface-muted">
        <span class="text-xs text-text-muted">
          {props.selectedIds.size} {props.selectedIds.size === 1 ? "member" : "members"} selected
        </span>
        <Button variant="default" size="sm" onClick={props.onAdd} disabled={props.selectedIds.size === 0}>
          Add to channel
        </Button>
      </div>
    </>
  )
}

function AddAgentView(props: {
  loading: boolean
  agents: Agents
  allAdded: boolean
  search: string
  onSearchChange: (v: string) => void
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  allSelected: boolean
  onCancel: () => void
  onAdd: () => void
  error: string | null
}) {
  return (
    <>
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
        <div class="relative flex-1">
          <MagnifyingGlass class="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-muted" />
          <Input
            type="text"
            placeholder="Search agent"
            value={props.search}
            onInput={(e) => props.onSearchChange(e.currentTarget.value)}
            class="w-full pl-7 h-6 text-xs"
          />
        </div>
        <Show when={!props.loading && props.agents.length > 0}>
          <button
            type="button"
            class="shrink-0 text-xs text-accent hover:text-accent-hover transition-colors"
            onClick={props.onSelectAll}
          >
            {props.allSelected ? "Deselect all" : "Select all"}
          </button>
        </Show>
      </div>
      <ModalBody class="p-0">
        <div class="h-[200px] overflow-y-auto scrollbar-thin">
          <Show when={props.loading}>
            <ListSkeleton />
            <ListSkeleton />
            <ListSkeleton />
          </Show>

          <Show when={!props.loading && props.allAdded}>
            <EmptyState icon={Robot} title="All added" description="All agents are in this channel" />
          </Show>

          <Show when={!props.loading && !props.allAdded && props.agents.length === 0}>
            <EmptyState icon={Robot} title="No results" description="No agents match your search" />
          </Show>

          <Show when={!props.loading && props.agents.length > 0}>
            <For each={props.agents}>
              {(agent) => {
                const selected = () => props.selectedIds.has(agent.id)
                return (
                  <button
                    type="button"
                    class="flex h-[34px] w-full items-center gap-2.5 px-3 text-left transition-colors hover:bg-surface-muted"
                    onClick={() => props.onToggle(agent.id)}
                  >
                    <Checkbox checked={selected()} class="pointer-events-none" />
                    <EntityIcon
                      icon={agent.icon}
                      iconColor={agent.iconColor}
                      size={20}
                      rounded="md"
                      iconScale={0.55}
                      fallback={Robot}
                    />
                    <span class="text-xs text-text truncate">{agent.name}</span>
                    <span class="text-xs text-text-muted truncate">({agent.slug})</span>
                  </button>
                )
              }}
            </For>
          </Show>
        </div>
      </ModalBody>

      <Show when={props.error}>
        <div class="px-3 py-2 border-t border-border">
          <p class="text-xs text-danger">{props.error}</p>
        </div>
      </Show>

      <div class="flex items-center justify-between border-t border-border px-3 py-2 bg-surface-muted">
        <span class="text-xs text-text-muted">
          {props.selectedIds.size} {props.selectedIds.size === 1 ? "agent" : "agents"} selected
        </span>
        <Button variant="default" size="sm" onClick={props.onAdd} disabled={props.selectedIds.size === 0}>
          Add to channel
        </Button>
      </div>
    </>
  )
}
