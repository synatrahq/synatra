import type { AppDefinition, AppId } from "@synatra/core/types"
import { intercom, verifyIntercomSignature, normalizeIntercomPayload } from "./intercom"
import { github, verifyGitHubSignature, normalizeGitHubPayload } from "./github"

export const apps: Record<AppId, AppDefinition> = {
  intercom,
  github,
}

export function getApp(id: AppId): AppDefinition {
  return apps[id]
}

export function verifySignature(appId: AppId, payload: string, signature: string, secret: string): boolean {
  switch (appId) {
    case "intercom":
      return verifyIntercomSignature(payload, signature, secret)
    case "github":
      return verifyGitHubSignature(payload, signature, secret)
    default:
      return false
  }
}

export function normalizePayload(appId: AppId, raw: unknown, eventHeader?: string) {
  switch (appId) {
    case "intercom":
      return normalizeIntercomPayload(raw as Parameters<typeof normalizeIntercomPayload>[0])
    case "github":
      return normalizeGitHubPayload(raw as Parameters<typeof normalizeGitHubPayload>[0], eventHeader ?? "")
    default:
      return raw
  }
}

export { intercom } from "./intercom"
export { github } from "./github"
