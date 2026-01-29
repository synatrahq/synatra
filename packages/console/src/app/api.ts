import { hc } from "hono/client"
import type { InferRequestType, InferResponseType } from "hono/client"
import type { AppType } from "@synatra/server"
import { extractErrorMessage, type ProblemDetails } from "@synatra/util/error"

export const apiBaseURL = import.meta.env.VITE_API_URL?.toString().trim() ?? ""

export class ApiError extends Error {
  constructor(
    message: string,
    public problem: ProblemDetails,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

const apiFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init)
  if (!res.ok) {
    const problem = (await res
      .json()
      .catch(() => ({ title: "Unknown error", name: "UnknownError", data: {} }))) as ProblemDetails
    throw new ApiError(extractErrorMessage(problem), problem)
  }
  return res
}

export const api = hc<AppType>(apiBaseURL, {
  init: { credentials: "include" },
  fetch: apiFetch,
})

export type Channel = InferResponseType<(typeof api.api.channels)[":id"]["$get"]>
export type Channels = InferResponseType<(typeof api.api.channels)["$get"]>
export type ChannelMembers = InferResponseType<(typeof api.api.channels)[":channelId"]["members"]["$get"]>
export type ChannelAgents = InferResponseType<(typeof api.api.channels)[":channelId"]["agents"]["$get"]>

export type Agent = InferResponseType<(typeof api.api.agents)[":id"]["$get"]>
export type Agents = InferResponseType<(typeof api.api.agents)["$get"]>
export type AgentReleases = InferResponseType<(typeof api.api.agents)[":id"]["releases"]["$get"]>
export type AgentWorkingCopy = InferResponseType<(typeof api.api.agents)[":id"]["working-copy"]["$get"]>
export type AgentPrompts = InferResponseType<(typeof api.api.agents)[":id"]["prompts"]["$get"]>
export type AgentPrompt = AgentPrompts[number]

export type Environment = InferResponseType<(typeof api.api.environments)[":id"]["$get"]>
export type Environments = InferResponseType<(typeof api.api.environments)["$get"]>

export type Trigger = InferResponseType<(typeof api.api.triggers)[":id"]["$get"]>
export type Triggers = InferResponseType<(typeof api.api.triggers)["$get"]>

export type Prompt = InferResponseType<(typeof api.api.prompts)[":id"]["$get"]>
export type Prompts = InferResponseType<(typeof api.api.prompts)["$get"]>
export type PromptReleases = InferResponseType<(typeof api.api.prompts)[":id"]["releases"]["$get"]>
export type PromptWorkingCopy = InferResponseType<(typeof api.api.prompts)[":id"]["working-copy"]["$get"]>

export type Resource = InferResponseType<(typeof api.api.resources)[":id"]["$get"]>
export type Resources = InferResponseType<(typeof api.api.resources)["$get"]>

export type Connectors = InferResponseType<(typeof api.api.connectors)["$get"]>
export type Connector = Connectors[number]

export type AppAccounts = InferResponseType<(typeof api.api)["app-accounts"]["$get"]>
export type AppAccount = AppAccounts[number]

export type Thread = InferResponseType<(typeof api.api.threads)[":id"]["$get"]>
export type ThreadMessage = Thread["messages"][number]
export type ThreadRun = Thread["runs"][number]
export type ThreadOutputItem = Thread["outputItems"][number]
export type ThreadHumanRequest = Thread["humanRequests"][number]
export type ThreadHumanResponse = Thread["humanResponses"][number]
export type ThreadAgent = NonNullable<Thread["agent"]>
export type ThreadTrigger = NonNullable<Thread["trigger"]>
export type Threads = InferResponseType<(typeof api.api.threads)["$get"]>
export type ThreadCounts = InferResponseType<(typeof api.api.threads)["counts"]["$get"]>

export type PlaygroundSession = InferResponseType<(typeof api.api.agents)[":id"]["playground"]["session"]["$get"]>
export type PlaygroundMessage = PlaygroundSession["messages"][number]
export type PlaygroundOutputItem = PlaygroundSession["outputItems"][number]
export type PlaygroundHumanRequest = PlaygroundSession["humanRequests"][number]
export type PlaygroundHumanResponse = PlaygroundSession["humanResponses"][number]
export type PlaygroundSessionData = PlaygroundSession["session"]
export type PlaygroundStatus = PlaygroundSessionData["status"]

export type OutputItem = ThreadOutputItem | PlaygroundOutputItem

// Input types (InferRequestType)
export type AgentCreateInput = InferRequestType<(typeof api.api.agents)["$post"]>["json"]
export type AgentUpdateInput = InferRequestType<(typeof api.api.agents)[":id"]["$patch"]>["json"]
export type AgentDeployInput = InferRequestType<(typeof api.api.agents)[":id"]["deploy"]["$post"]>["json"]
export type AgentWorkingCopySaveInput = InferRequestType<
  (typeof api.api.agents)[":id"]["working-copy"]["save"]["$post"]
>["json"]

export type TriggerCreateInput = InferRequestType<(typeof api.api.triggers)["$post"]>["json"]
export type TriggerUpdateInput = InferRequestType<(typeof api.api.triggers)[":id"]["$patch"]>["json"]
export type TriggerToggleInput = InferRequestType<(typeof api.api.triggers)[":id"]["toggle"]["$post"]>["json"]
export type TriggerDeployInput = InferRequestType<(typeof api.api.triggers)[":id"]["deploy"]["$post"]>["json"]
export type TriggerWorkingCopySaveInput = InferRequestType<
  (typeof api.api.triggers)[":id"]["working-copy"]["save"]["$post"]
>["json"]
export type TriggerEnvironmentAddInput = InferRequestType<
  (typeof api.api.triggers)[":id"]["environments"]["add"]["$post"]
>["json"]
export type TriggerEnvironmentUpdateInput = InferRequestType<
  (typeof api.api.triggers)[":id"]["environments"][":environmentId"]["$patch"]
>["json"]
export type TriggerRegenerateSecretInput = InferRequestType<
  (typeof api.api.triggers)[":id"]["regenerate-secret"]["$post"]
>["json"]

export type PromptCreateInput = InferRequestType<(typeof api.api.prompts)["$post"]>["json"]
export type PromptUpdateInput = InferRequestType<(typeof api.api.prompts)[":id"]["$patch"]>["json"]
export type PromptWorkingCopySaveInput = InferRequestType<
  (typeof api.api.prompts)[":id"]["working-copy"]["save"]["$post"]
>["json"]
export type PromptDeployInput = InferRequestType<(typeof api.api.prompts)[":id"]["deploy"]["$post"]>["json"]

export type ResourceCreateInput = InferRequestType<(typeof api.api.resources)["$post"]>["json"]
export type ResourceUpdateInput = InferRequestType<(typeof api.api.resources)[":id"]["$patch"]>["json"]
export type ResourceConfigCreateInput = InferRequestType<(typeof api.api.resources)[":id"]["config"]["$post"]>["json"]

export type EnvironmentCreateInput = InferRequestType<(typeof api.api.environments)["$post"]>["json"]
export type EnvironmentUpdateInput = InferRequestType<(typeof api.api.environments)[":id"]["$patch"]>["json"]

export type ConnectorCreateInput = InferRequestType<(typeof api.api.connectors)["$post"]>["json"]

export type ThreadCreateInput = InferRequestType<(typeof api.api.threads)["$post"]>["json"]
export type HumanRequestRespondInput = InferRequestType<
  (typeof api.api.threads)[":threadId"]["human-requests"][":requestId"]["respond"]["$post"]
>["json"]

export type ChannelAgentsAddInput = InferRequestType<(typeof api.api.channels)[":channelId"]["agents"]["$post"]>["json"]

export type UsageCurrent = InferResponseType<(typeof api.api.usage)["current"]["$get"]>
export type UsageHistory = InferResponseType<(typeof api.api.usage)["history"]["$get"]>
export type UsagePeriod = UsageHistory["periods"][number]

export type SubscriptionCurrent = InferResponseType<(typeof api.api.subscriptions)["current"]["$get"]>
export type CheckoutSessionResponse = InferResponseType<(typeof api.api.subscriptions)["create-checkout"]["$post"]>

export type Recipe = InferResponseType<(typeof api.api.recipes)[":id"]["$get"]>
export type Recipes = InferResponseType<(typeof api.api.recipes)["$get"]>
export type RecipeExecutions = InferResponseType<(typeof api.api.recipes)[":id"]["executions"]["$get"]>
export type RecipeExecution = RecipeExecutions[number]
export type RecipeReleases = InferResponseType<(typeof api.api.recipes)[":id"]["releases"]["$get"]>
export type RecipeRelease = RecipeReleases[number]
export type RecipeWorkingCopy = InferResponseType<(typeof api.api.recipes)[":id"]["working-copy"]["$get"]>
export type RecipeCreateInput = InferRequestType<(typeof api.api.recipes)["$post"]>["json"]
export type RecipeUpdateInput = InferRequestType<(typeof api.api.recipes)[":id"]["$patch"]>["json"]
export type RecipeExtractInput = InferRequestType<(typeof api.api.recipes)["extract"]["$post"]>["json"]
export type RecipeExtractResult = InferResponseType<(typeof api.api.recipes)["extract"]["$post"]>
export type RecipeExecuteInput = InferRequestType<(typeof api.api.recipes)[":id"]["execute"]["$post"]>["json"]
export type RecipeDeployInput = InferRequestType<(typeof api.api.recipes)[":id"]["deploy"]["$post"]>["json"]
