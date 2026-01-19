import { createSignal, createEffect, Show, createMemo } from "solid-js"
import { Title, Meta } from "@solidjs/meta"
import { useParams, useNavigate } from "@solidjs/router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/solid-query"
import { api, AdminGuard, auth, activeOrg } from "../../app"
import { Shell } from "../../components"
import type { Role } from "@synatra/core/permissions"
import { SettingsSidebar } from "./settings-sidebar"
import { EnvironmentList } from "./environment-list"
import { EnvironmentCreateModal } from "./environment-create-modal"
import { EnvironmentEditModal } from "./environment-edit-modal"
import type {
  Environment,
  Connector,
  AppAccount,
  EnvironmentCreateInput,
  EnvironmentUpdateInput,
  ConnectorCreateInput,
  UsageCurrent,
  UsagePeriod,
  SubscriptionCurrent,
} from "../../app/api"
import { EnvironmentDeleteModal } from "./environment-delete-modal"
import { MemberList, type Member, type Invitation } from "./member-list"
import { MemberInviteModal } from "./member-invite-modal"
import { MemberRemoveModal } from "./member-remove-modal"
import { ConnectorList } from "./connector-list"
import { ConnectorCreateModal } from "./connector-create-modal"
import { ConnectorDeleteModal } from "./connector-delete-modal"
import { ConnectorTokenModal } from "./connector-token-modal"
import { AppAccountList } from "./app-account-list"
import { AppConnectModal } from "./app-connect-modal"
import { AppAccountDeleteModal } from "./app-account-delete-modal"
import { UsageList } from "./usage-list"
import { BillingList } from "./billing-list"
import { PlanChangeModal } from "./plan-change-modal"
import { CancelScheduleModal } from "./cancel-schedule-modal"
import { CancelSubscriptionModal } from "./cancel-subscription-modal"
import { ResumeSubscriptionModal } from "./resume-subscription-modal"
import { PLAN_HIERARCHY, type SubscriptionPlan } from "@synatra/core/types"

const noop = () => {}

function isUpgrade(current: SubscriptionPlan, target: SubscriptionPlan): boolean {
  return PLAN_HIERARCHY[target] > PLAN_HIERARCHY[current]
}

function PageSkeleton() {
  return (
    <Shell>
      <SettingsSidebar />
      <MemberList
        members={[]}
        invitations={[]}
        loading={true}
        onInviteClick={noop}
        onRoleChange={noop}
        onRemoveMember={noop}
        onRemoveInvitation={noop}
        onResendInvitation={noop}
      />
    </Shell>
  )
}

export default function SettingsPage() {
  const params = useParams<{ tab?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [envCreateModalOpen, setEnvCreateModalOpen] = createSignal(false)
  const [envEditModalOpen, setEnvEditModalOpen] = createSignal(false)
  const [editingEnvironment, setEditingEnvironment] = createSignal<Environment | null>(null)
  const [envDeleteModalOpen, setEnvDeleteModalOpen] = createSignal(false)
  const [deletingEnvironment, setDeletingEnvironment] = createSignal<Environment | null>(null)

  const [memberInviteModalOpen, setMemberInviteModalOpen] = createSignal(false)
  const [memberRemoveModalOpen, setMemberRemoveModalOpen] = createSignal(false)
  const [removingTarget, setRemovingTarget] = createSignal<{
    type: "member" | "invitation"
    id: string
    name: string
  } | null>(null)

  const [connectorCreateModalOpen, setConnectorCreateModalOpen] = createSignal(false)
  const [connectorDeleteModalOpen, setConnectorDeleteModalOpen] = createSignal(false)
  const [deletingConnector, setDeletingConnector] = createSignal<Connector | null>(null)
  const [connectorTokenModalOpen, setConnectorTokenModalOpen] = createSignal(false)
  const [newConnectorToken, setNewConnectorToken] = createSignal<{ name: string; token: string } | null>(null)

  const [appConnectModalOpen, setAppConnectModalOpen] = createSignal(false)
  const [connectingAppId, setConnectingAppId] = createSignal<string | null>(null)
  const [appConnecting, setAppConnecting] = createSignal(false)
  const [appDeleteModalOpen, setAppDeleteModalOpen] = createSignal(false)
  const [deletingAppAccount, setDeletingAppAccount] = createSignal<AppAccount | null>(null)

  const [planChangeModalOpen, setPlanChangeModalOpen] = createSignal(false)
  const [targetPlan, setTargetPlan] = createSignal<string | null>(null)
  const [cancelScheduleModalOpen, setCancelScheduleModalOpen] = createSignal(false)
  const [cancelSubscriptionModalOpen, setCancelSubscriptionModalOpen] = createSignal(false)
  const [resumeSubscriptionModalOpen, setResumeSubscriptionModalOpen] = createSignal(false)

  const currentTab = createMemo(() => params.tab ?? "users")

  const environmentsQuery = useQuery(() => ({
    queryKey: ["settings", "environments", activeOrg()?.id],
    queryFn: async () => {
      const res = await api.api.environments.$get()
      return res.json() as Promise<Environment[]>
    },
    enabled: !!activeOrg()?.id,
  }))

  const membersQuery = useQuery(() => ({
    queryKey: ["settings", "members", activeOrg()?.id],
    queryFn: async () => {
      const [membersRes, invitationsRes] = await Promise.all([
        auth.organization.listMembers(),
        auth.organization.listInvitations(),
      ])
      const members: Member[] = membersRes.data
        ? membersRes.data.members.map((m) => ({
            id: m.id,
            userId: m.userId,
            role: m.role as Role,
            user: { id: m.user.id, name: m.user.name ?? null, email: m.user.email, image: m.user.image ?? null },
            createdAt: m.createdAt.toString(),
          }))
        : []
      const invitations: Invitation[] = invitationsRes.data
        ? invitationsRes.data.map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role as Role,
            status: i.status as Invitation["status"],
            expiresAt: i.expiresAt.toString(),
            createdAt: i.createdAt?.toString() ?? "",
          }))
        : []
      return { members, invitations }
    },
    enabled: !!activeOrg()?.id,
  }))

  const connectorsQuery = useQuery(() => ({
    queryKey: ["settings", "connectors", activeOrg()?.id],
    queryFn: async () => {
      const res = await api.api.connectors.$get()
      return res.json() as Promise<Connector[]>
    },
    enabled: !!activeOrg()?.id,
  }))

  const appAccountsQuery = useQuery(() => ({
    queryKey: ["settings", "app-accounts", activeOrg()?.id],
    queryFn: async () => {
      const res = await api.api["app-accounts"].$get()
      return res.json() as Promise<AppAccount[]>
    },
    enabled: !!activeOrg()?.id,
  }))

  const usageCurrentQuery = useQuery(() => ({
    queryKey: ["settings", "usage", "current", activeOrg()?.id],
    queryFn: async () => {
      const res = await api.api.usage.current.$get()
      return res.json() as Promise<UsageCurrent>
    },
    enabled: !!activeOrg()?.id,
  }))

  const usageHistoryQuery = useQuery(() => ({
    queryKey: ["settings", "usage", "history", activeOrg()?.id],
    queryFn: async () => {
      const res = await api.api.usage.history.$get({ query: { months: "6" } })
      return res.json() as Promise<{ periods: UsagePeriod[] }>
    },
    enabled: !!activeOrg()?.id,
  }))

  const subscriptionQuery = useQuery(() => ({
    queryKey: ["settings", "subscription", activeOrg()?.id],
    queryFn: async () => {
      const res = await api.api.subscriptions.current.$get()
      return res.json() as Promise<SubscriptionCurrent>
    },
    enabled: !!activeOrg()?.id,
  }))

  const envCreateMutate = useMutation(() => ({
    mutationFn: async (data: EnvironmentCreateInput) => {
      const res = await api.api.environments.$post({ json: data })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "environments"] })
      queryClient.invalidateQueries({ queryKey: ["environments"] })
      setEnvCreateModalOpen(false)
    },
  }))

  const envEditMutate = useMutation(() => ({
    mutationFn: async (data: { id: string } & EnvironmentUpdateInput) => {
      const { id, ...json } = data
      const res = await api.api.environments[":id"].$patch({ param: { id }, json })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "environments"] })
      queryClient.invalidateQueries({ queryKey: ["environments"] })
      setEnvEditModalOpen(false)
      setEditingEnvironment(null)
    },
  }))

  const envDeleteMutate = useMutation(() => ({
    mutationFn: async (id: string) => {
      await api.api.environments[":id"].$delete({ param: { id } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "environments"] })
      queryClient.invalidateQueries({ queryKey: ["environments"] })
      setEnvDeleteModalOpen(false)
      setDeletingEnvironment(null)
    },
  }))

  const memberInviteMutate = useMutation(() => ({
    mutationFn: async (data: { emails: string[]; role: Role }) => {
      const res = await api.api.organizations.invitations.bulk.$post({
        json: { emails: data.emails, role: data.role },
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "members"] })
      setMemberInviteModalOpen(false)
    },
  }))

  const memberRoleChangeMutate = useMutation(() => ({
    mutationFn: async (data: { memberId: string; role: Role }) => {
      await auth.organization.updateMemberRole({ memberId: data.memberId, role: data.role })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "members"] })
    },
  }))

  const memberRemoveMutate = useMutation(() => ({
    mutationFn: async (data: { type: "member" | "invitation"; id: string }) => {
      if (data.type === "member") {
        await auth.organization.removeMember({ memberIdOrEmail: data.id })
        return
      }
      await auth.organization.cancelInvitation({ invitationId: data.id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "members"] })
      setMemberRemoveModalOpen(false)
      setRemovingTarget(null)
    },
  }))

  const connectorCreateMutate = useMutation(() => ({
    mutationFn: async (data: ConnectorCreateInput) => {
      const res = await api.api.connectors.$post({ json: data })
      return res.json()
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["settings", "connectors"] })
      queryClient.invalidateQueries({ queryKey: ["connectors"] })
      setConnectorCreateModalOpen(false)
      setNewConnectorToken({ name: result.connector.name, token: result.token })
      setConnectorTokenModalOpen(true)
    },
  }))

  const connectorRegenerateMutate = useMutation(() => ({
    mutationFn: async (id: string) => {
      const res = await api.api.connectors[":id"]["regenerate-token"].$post({ param: { id } })
      return res.json()
    },
    onSuccess: (result) => {
      setNewConnectorToken({ name: result.connector.name, token: result.token })
      setConnectorTokenModalOpen(true)
    },
  }))

  const connectorDeleteMutate = useMutation(() => ({
    mutationFn: async (id: string) => {
      await api.api.connectors[":id"].$delete({ param: { id } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "connectors"] })
      queryClient.invalidateQueries({ queryKey: ["connectors"] })
      setConnectorDeleteModalOpen(false)
      setDeletingConnector(null)
    },
  }))

  const appDeleteMutate = useMutation(() => ({
    mutationFn: async (id: string) => {
      await api.api["app-accounts"][":id"].$delete({ param: { id } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "app-accounts"] })
      queryClient.invalidateQueries({ queryKey: ["app-accounts"] })
      setAppDeleteModalOpen(false)
      setDeletingAppAccount(null)
    },
  }))

  const changePlanMutate = useMutation(() => ({
    mutationFn: async (plan: string) => {
      if (plan === "free" || plan === "enterprise") throw new Error("Cannot change to free or enterprise plan")
      const typedPlan = plan as "starter" | "pro" | "business"

      if (subscription()?.stripeSubscriptionId) {
        const res = await api.api.subscriptions["change-plan"].$post({ json: { plan: typedPlan } })
        return { type: "change" as const, data: await res.json() }
      }

      const res = await api.api.subscriptions["create-checkout"].$post({
        json: {
          plan: typedPlan,
          successUrl: `${window.location.origin}/settings/billing?success=true`,
          cancelUrl: `${window.location.origin}/settings/billing?cancelled=true`,
        },
      })
      return { type: "checkout" as const, data: await res.json() }
    },
    onSuccess: (result) => {
      if (result.type === "checkout" && result.data.url) window.location.href = result.data.url
      else if (result.type === "change") void subscriptionQuery.refetch()
    },
  }))

  const cancelScheduleMutate = useMutation(() => ({
    mutationFn: async () => {
      const res = await api.api.subscriptions["cancel-schedule"].$post()
      return res.json()
    },
    onSuccess: () => {
      void subscriptionQuery.refetch()
    },
  }))

  const billingPortalMutate = useMutation(() => ({
    mutationFn: async () => {
      const res = await api.api.subscriptions["billing-portal"].$post({
        json: { returnUrl: window.location.href },
      })
      return res.json()
    },
    onSuccess: (result) => {
      if (result.url) window.location.href = result.url
    },
  }))

  const cancelSubscriptionMutate = useMutation(() => ({
    mutationFn: async () => {
      const res = await api.api.subscriptions.cancel.$post()
      return res.json()
    },
    onSuccess: () => {
      void subscriptionQuery.refetch()
    },
  }))

  const resumeSubscriptionMutate = useMutation(() => ({
    mutationFn: async () => {
      const res = await api.api.subscriptions.resume.$post()
      return res.json()
    },
    onSuccess: () => {
      void subscriptionQuery.refetch()
    },
  }))

  const handlePlanChangeRequest = (plan: string) => {
    setTargetPlan(plan)
    setPlanChangeModalOpen(true)
  }

  const handlePlanChangeConfirm = async () => {
    const plan = targetPlan()
    if (!plan) return
    await changePlanMutate.mutateAsync(plan)
    setPlanChangeModalOpen(false)
  }

  const handleCancelScheduleConfirm = async () => {
    await cancelScheduleMutate.mutateAsync()
    setCancelScheduleModalOpen(false)
  }

  createEffect(() => {
    if (!params.tab) {
      navigate("/settings/users", { replace: true })
    }
  })

  const environments = () => environmentsQuery.data ?? []
  const members = () => membersQuery.data?.members ?? []
  const invitations = () => membersQuery.data?.invitations ?? []
  const connectors = () => connectorsQuery.data ?? []
  const appAccounts = () => appAccountsQuery.data ?? []
  const usageCurrent = () => usageCurrentQuery.data ?? null
  const usageHistory = () => usageHistoryQuery.data?.periods ?? []
  const subscription = () => subscriptionQuery.data ?? null

  const handleRoleChange = async (memberId: string, role: Role) => {
    await memberRoleChangeMutate.mutateAsync({ memberId, role })
  }

  const handleResendInvitation = async (invitation: Invitation) => {
    await auth.organization.inviteMember({ email: invitation.email, role: invitation.role, resend: true })
  }

  const handleConnectorRegenerate = async (connector: Connector) => {
    await connectorRegenerateMutate.mutateAsync(connector.id)
  }

  const handleAppConnect = async (appId: string, name: string) => {
    setAppConnecting(true)

    if (appId === "github") {
      const res = await api.api["app-accounts"].github.start.$post({
        json: { name, returnUrl: window.location.href },
      })
      if (res.ok) {
        const data = await res.json()
        window.location.href = data.url
        return
      }
    }

    if (appId === "intercom") {
      const res = await api.api["app-accounts"].oauth.start.$post({ json: { appId, name } })
      if (res.ok) {
        const data = await res.json()
        window.location.href = data.authUrl
        return
      }
    }

    setAppConnecting(false)
    setAppConnectModalOpen(false)
    alert("Failed to start app connection. Please try again.")
  }

  return (
    <>
      <Title>{`Settings | ${activeOrg()?.name ?? "Synatra"}`}</Title>
      <Meta name="description" content="Manage your workspace settings, environments, and team members." />
      <AdminGuard fallback={<PageSkeleton />}>
        <Shell>
          <SettingsSidebar />

          <Show when={currentTab() === "environments"}>
            <EnvironmentList
              environments={environments()}
              loading={environmentsQuery.isPending}
              onCreateClick={() => setEnvCreateModalOpen(true)}
              onEditClick={(env) => {
                setEditingEnvironment(env)
                setEnvEditModalOpen(true)
              }}
              onDeleteClick={(env) => {
                setDeletingEnvironment(env)
                setEnvDeleteModalOpen(true)
              }}
            />
          </Show>

          <Show when={currentTab() === "users"}>
            <MemberList
              members={members()}
              invitations={invitations()}
              loading={membersQuery.isPending}
              onInviteClick={() => setMemberInviteModalOpen(true)}
              onRoleChange={handleRoleChange}
              onRemoveMember={(m) => {
                setRemovingTarget({ type: "member", id: m.id, name: m.user.name || m.user.email })
                setMemberRemoveModalOpen(true)
              }}
              onRemoveInvitation={(inv) => {
                setRemovingTarget({ type: "invitation", id: inv.id, name: inv.email })
                setMemberRemoveModalOpen(true)
              }}
              onResendInvitation={handleResendInvitation}
            />
          </Show>

          <Show when={currentTab() === "connectors"}>
            <ConnectorList
              connectors={connectors()}
              loading={connectorsQuery.isPending}
              onCreateClick={() => setConnectorCreateModalOpen(true)}
              onRegenerateClick={handleConnectorRegenerate}
              onDeleteClick={(connector) => {
                setDeletingConnector(connector)
                setConnectorDeleteModalOpen(true)
              }}
            />
          </Show>

          <Show when={currentTab() === "apps"}>
            <AppAccountList
              accounts={appAccounts()}
              loading={appAccountsQuery.isPending}
              onConnectClick={(appId) => {
                setConnectingAppId(appId)
                setAppConnectModalOpen(true)
              }}
              onDeleteClick={(account) => {
                setDeletingAppAccount(account)
                setAppDeleteModalOpen(true)
              }}
            />
          </Show>

          <Show when={currentTab() === "usage"}>
            <UsageList
              current={usageCurrent()}
              history={usageHistory()}
              subscription={subscription()}
              loading={usageCurrentQuery.isPending || usageHistoryQuery.isPending}
            />
          </Show>

          <Show when={currentTab() === "billing"}>
            <BillingList
              subscription={subscription()}
              loading={subscriptionQuery.isPending}
              onPlanChangeRequest={handlePlanChangeRequest}
              changingPlan={changePlanMutate.isPending}
              onCancelScheduleRequest={() => setCancelScheduleModalOpen(true)}
              cancellingSchedule={cancelScheduleMutate.isPending}
              onManageBilling={() => billingPortalMutate.mutate()}
              managingBilling={billingPortalMutate.isPending}
              onCancelSubscription={() => setCancelSubscriptionModalOpen(true)}
              cancellingSubscription={cancelSubscriptionMutate.isPending}
              onResumeSubscription={() => setResumeSubscriptionModalOpen(true)}
              resumingSubscription={resumeSubscriptionMutate.isPending}
            />
          </Show>
        </Shell>

        <EnvironmentCreateModal
          open={envCreateModalOpen()}
          onClose={() => setEnvCreateModalOpen(false)}
          onSave={async (data) => {
            await envCreateMutate.mutateAsync(data)
          }}
          saving={envCreateMutate.isPending}
        />

        <EnvironmentEditModal
          open={envEditModalOpen()}
          environment={editingEnvironment()}
          onClose={() => {
            setEnvEditModalOpen(false)
            setEditingEnvironment(null)
          }}
          onSave={async (id, data) => {
            await envEditMutate.mutateAsync({ id, ...data })
          }}
          saving={envEditMutate.isPending}
        />

        <EnvironmentDeleteModal
          open={envDeleteModalOpen()}
          environmentName={deletingEnvironment()?.name ?? ""}
          onClose={() => {
            setEnvDeleteModalOpen(false)
            setDeletingEnvironment(null)
          }}
          onConfirm={async () => {
            const env = deletingEnvironment()
            if (env) await envDeleteMutate.mutateAsync(env.id)
          }}
          deleting={envDeleteMutate.isPending}
        />

        <MemberInviteModal
          open={memberInviteModalOpen()}
          onClose={() => setMemberInviteModalOpen(false)}
          onInvite={async (emails, role) => {
            await memberInviteMutate.mutateAsync({ emails, role })
          }}
          inviting={memberInviteMutate.isPending}
          currentUserCount={members().length + invitations().filter((i) => i.status === "pending").length}
          plan={(subscriptionQuery.data?.plan as SubscriptionPlan) ?? null}
        />

        <MemberRemoveModal
          open={memberRemoveModalOpen()}
          type={removingTarget()?.type ?? "member"}
          identifier={removingTarget()?.name ?? ""}
          onClose={() => {
            setMemberRemoveModalOpen(false)
            setRemovingTarget(null)
          }}
          onConfirm={async () => {
            const target = removingTarget()
            if (target) await memberRemoveMutate.mutateAsync({ type: target.type, id: target.id })
          }}
          removing={memberRemoveMutate.isPending}
        />

        <ConnectorCreateModal
          open={connectorCreateModalOpen()}
          onClose={() => setConnectorCreateModalOpen(false)}
          onSave={async (data) => {
            await connectorCreateMutate.mutateAsync(data)
          }}
          saving={connectorCreateMutate.isPending}
        />

        <ConnectorDeleteModal
          open={connectorDeleteModalOpen()}
          connectorName={deletingConnector()?.name ?? ""}
          onClose={() => {
            setConnectorDeleteModalOpen(false)
            setDeletingConnector(null)
          }}
          onConfirm={async () => {
            const connector = deletingConnector()
            if (connector) await connectorDeleteMutate.mutateAsync(connector.id)
          }}
          deleting={connectorDeleteMutate.isPending}
        />

        <ConnectorTokenModal
          open={connectorTokenModalOpen()}
          connectorName={newConnectorToken()?.name ?? ""}
          token={newConnectorToken()?.token ?? ""}
          onClose={() => {
            setConnectorTokenModalOpen(false)
            setNewConnectorToken(null)
          }}
        />

        <AppConnectModal
          open={appConnectModalOpen()}
          appId={connectingAppId()}
          onClose={() => {
            setAppConnectModalOpen(false)
            setConnectingAppId(null)
          }}
          onConnect={handleAppConnect}
          connecting={appConnecting()}
        />

        <AppAccountDeleteModal
          open={appDeleteModalOpen()}
          accountName={deletingAppAccount()?.name ?? ""}
          onClose={() => {
            setAppDeleteModalOpen(false)
            setDeletingAppAccount(null)
          }}
          onConfirm={async () => {
            const account = deletingAppAccount()
            if (account) await appDeleteMutate.mutateAsync(account.id)
          }}
          deleting={appDeleteMutate.isPending}
        />

        <Show when={planChangeModalOpen() && subscription() && targetPlan()}>
          <PlanChangeModal
            open={planChangeModalOpen()}
            currentPlan={subscription()!.plan as SubscriptionPlan}
            targetPlan={targetPlan()! as SubscriptionPlan}
            isUpgrade={isUpgrade(subscription()!.plan as SubscriptionPlan, targetPlan()! as SubscriptionPlan)}
            onClose={() => setPlanChangeModalOpen(false)}
            onConfirm={handlePlanChangeConfirm}
            changing={changePlanMutate.isPending}
          />
        </Show>

        <Show when={cancelScheduleModalOpen() && subscription()?.scheduledPlan && subscription()?.scheduledAt}>
          <CancelScheduleModal
            open={cancelScheduleModalOpen()}
            currentPlan={subscription()!.plan as SubscriptionPlan}
            scheduledPlan={subscription()!.scheduledPlan! as SubscriptionPlan}
            scheduledDate={new Date(subscription()!.scheduledAt!).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            onClose={() => setCancelScheduleModalOpen(false)}
            onConfirm={handleCancelScheduleConfirm}
            cancelling={cancelScheduleMutate.isPending}
          />
        </Show>

        <Show when={cancelSubscriptionModalOpen() && subscription()?.currentPeriodEnd}>
          <CancelSubscriptionModal
            open={cancelSubscriptionModalOpen()}
            cancelDate={new Date(subscription()!.currentPeriodEnd!).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            onClose={() => setCancelSubscriptionModalOpen(false)}
            onConfirm={async () => {
              await cancelSubscriptionMutate.mutateAsync()
              setCancelSubscriptionModalOpen(false)
            }}
            cancelling={cancelSubscriptionMutate.isPending}
          />
        </Show>

        <Show when={resumeSubscriptionModalOpen()}>
          <ResumeSubscriptionModal
            open={resumeSubscriptionModalOpen()}
            onClose={() => setResumeSubscriptionModalOpen(false)}
            onConfirm={async () => {
              await resumeSubscriptionMutate.mutateAsync()
              setResumeSubscriptionModalOpen(false)
            }}
            resuming={resumeSubscriptionMutate.isPending}
          />
        </Show>
      </AdminGuard>
    </>
  )
}
