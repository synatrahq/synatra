import { createHmac, timingSafeEqual } from "crypto"
import type { AppDefinition } from "@synatra/core/types"

export const github: AppDefinition = {
  id: "github",
  name: "GitHub",
  authType: "github_app",
  events: [
    { id: "push", name: "Push", description: "Commits pushed to a branch" },
    { id: "create.branch", name: "Branch created", description: "Branch created" },
    { id: "create.tag", name: "Tag created", description: "Tag created" },
    { id: "delete.branch", name: "Branch deleted", description: "Branch deleted" },
    { id: "delete.tag", name: "Tag deleted", description: "Tag deleted" },
    { id: "pull_request.opened", name: "PR opened", description: "Pull request created" },
    { id: "pull_request.merged", name: "PR merged", description: "Pull request merged" },
    { id: "pull_request.closed", name: "PR closed", description: "Pull request closed without merge" },
    { id: "pull_request.reopened", name: "PR reopened", description: "Pull request reopened" },
    { id: "pull_request.synchronize", name: "PR updated", description: "New commits pushed to PR" },
    { id: "pull_request.ready_for_review", name: "PR ready for review", description: "Draft PR marked ready" },
    { id: "issues.opened", name: "Issue opened", description: "Issue created" },
    { id: "issues.closed", name: "Issue closed", description: "Issue closed" },
    { id: "issues.reopened", name: "Issue reopened", description: "Issue reopened" },
    { id: "issue_comment.created", name: "Issue comment", description: "Comment on issue" },
    { id: "pull_request_comment.created", name: "PR comment", description: "Comment on pull request" },
    { id: "pull_request_review.approved", name: "Review approved", description: "PR approved" },
    { id: "pull_request_review.changes_requested", name: "Changes requested", description: "Changes requested on PR" },
    { id: "pull_request_review.commented", name: "Review commented", description: "Review comment without approval" },
    { id: "release.published", name: "Release published", description: "Release published" },
  ],
  webhookSecretHeader: "x-hub-signature-256",
}

export type GitHubWebhookPayload = {
  action?: string
  installation?: { id: number }
  repository?: { id: number; name: string; full_name: string; owner: { login: string } }
  sender?: { login: string; id: number }
  ref?: string
  ref_type?: "branch" | "tag"
  head_commit?: { id: string; message: string; author: { name: string; email: string } }
  pull_request?: { number: number; title: string; state: string; merged?: boolean }
  issue?: { number: number; title: string; state: string; pull_request?: unknown }
  comment?: { id: number; body: string }
  review?: { id: number; state: string; body?: string }
  release?: { id: number; tag_name: string; name: string }
}

export function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  if (!signature.startsWith("sha256=")) return false
  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex")
  const sig = Buffer.from(signature)
  const exp = Buffer.from(expected)
  if (sig.length !== exp.length) return false
  return timingSafeEqual(sig, exp)
}

export function normalizeGitHubPayload(raw: GitHubWebhookPayload, eventHeader: string) {
  let event = eventHeader
  if (raw.action) {
    event = `${eventHeader}.${raw.action}`
    if (eventHeader === "pull_request" && raw.action === "closed" && raw.pull_request?.merged) {
      event = "pull_request.merged"
    }
    if (eventHeader === "pull_request_review" && raw.action === "submitted" && raw.review?.state) {
      event = `pull_request_review.${raw.review.state}`
    }
    if (eventHeader === "issue_comment" && raw.action === "created" && raw.issue?.pull_request) {
      event = "pull_request_comment.created"
    }
  } else if (raw.ref_type) {
    event = `${eventHeader}.${raw.ref_type}`
  }
  return {
    event,
    action: raw.action,
    installationId: raw.installation?.id,
    repository: raw.repository
      ? {
          id: raw.repository.id,
          name: raw.repository.name,
          fullName: raw.repository.full_name,
          owner: raw.repository.owner.login,
        }
      : undefined,
    sender: raw.sender ? { login: raw.sender.login, id: raw.sender.id } : undefined,
    ref: raw.ref,
    refType: raw.ref_type,
    headCommit: raw.head_commit
      ? {
          id: raw.head_commit.id,
          message: raw.head_commit.message,
          author: raw.head_commit.author,
        }
      : undefined,
    pullRequest: raw.pull_request
      ? {
          number: raw.pull_request.number,
          title: raw.pull_request.title,
          state: raw.pull_request.state,
          merged: raw.pull_request.merged,
        }
      : undefined,
    issue: raw.issue
      ? {
          number: raw.issue.number,
          title: raw.issue.title,
          state: raw.issue.state,
        }
      : undefined,
    comment: raw.comment ? { id: raw.comment.id, body: raw.comment.body } : undefined,
    review: raw.review
      ? {
          id: raw.review.id,
          state: raw.review.state,
          body: raw.review.body,
        }
      : undefined,
    release: raw.release
      ? {
          id: raw.release.id,
          tagName: raw.release.tag_name,
          name: raw.release.name,
        }
      : undefined,
    raw,
  }
}
