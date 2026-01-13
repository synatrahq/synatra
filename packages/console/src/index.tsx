import "./index.css"
import { render } from "solid-js/web"
import { createEffect } from "solid-js"
import { Router, Route, useNavigate } from "@solidjs/router"
import { SpinnerGap } from "phosphor-solid-js"
import Layout from "./pages/layout"
import { user, loading, needsProfile, orgStatus } from "./app/session"
import Login from "./pages/login"
import SetupProfile from "./pages/setup-profile"
import CreateOrganization from "./pages/create-organization"
import AcceptInvitation from "./pages/accept-invitation"
import Inbox from "./pages/inbox"
import Agents from "./pages/agents"
import Prompts from "./pages/prompts"
import Triggers from "./pages/triggers"
import Resources from "./pages/resources"
import Settings from "./pages/settings"
import Onboarding from "./pages/onboarding"

function RootRedirect() {
  const navigate = useNavigate()

  createEffect(() => {
    if (loading()) return
    if (!user()) {
      navigate("/login", { replace: true })
      return
    }
    if (needsProfile()) {
      navigate("/setup-profile", { replace: true })
      return
    }
    if (orgStatus() === "none") {
      navigate("/organizations/new", { replace: true })
      return
    }
    navigate("/inbox", { replace: true })
  })

  return (
    <div class="flex min-h-screen items-center justify-center bg-surface">
      <SpinnerGap class="h-5 w-5 animate-spin text-text-muted" />
    </div>
  )
}

const root = document.getElementById("root")

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error("Root element not found. Did you forget to add it to your index.html?")
}

render(
  () => (
    <Router root={Layout}>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={Login} />
      <Route path="/setup-profile" component={SetupProfile} />
      <Route path="/organizations/new" component={CreateOrganization} />
      <Route path="/accept-invitation/:id" component={AcceptInvitation} />
      <Route path="/inbox/:channelSlug?" component={Inbox} />
      <Route path="/agents" component={Agents} />
      <Route path="/agents/:id" component={Agents} />
      <Route path="/prompts" component={Prompts} />
      <Route path="/prompts/:id" component={Prompts} />
      <Route path="/triggers" component={Triggers} />
      <Route path="/triggers/:id" component={Triggers} />
      <Route path="/resources" component={Resources} />
      <Route path="/resources/:id" component={Resources} />
      <Route path="/settings" component={Settings} />
      <Route path="/settings/:tab" component={Settings} />
      <Route path="/onboarding" component={Onboarding} />
    </Router>
  ),
  root!,
)
