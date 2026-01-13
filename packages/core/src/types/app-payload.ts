const githubFields = {
  event: { type: "string", description: "Event type (e.g. pull_request.opened)" },
  action: { type: "string", description: "Action that triggered the event" },
  installationId: { type: "number", description: "GitHub App installation ID" },
  repository: {
    type: "object",
    description: "Repository where the event occurred",
    properties: {
      id: { type: "number", description: "Repository ID" },
      name: { type: "string", description: "Repository name" },
      fullName: { type: "string", description: "Full name (owner/repo)" },
      owner: { type: "string", description: "Repository owner" },
    },
  },
  sender: {
    type: "object",
    description: "User who triggered the event",
    properties: {
      login: { type: "string", description: "Username" },
      id: { type: "number", description: "User ID" },
    },
  },
  ref: { type: "string", description: "Git ref (branch or tag name)" },
  refType: { type: "string", description: "Ref type (branch or tag)" },
  headCommit: {
    type: "object",
    description: "Head commit of the push",
    properties: {
      id: { type: "string", description: "Commit SHA" },
      message: { type: "string", description: "Commit message" },
      author: {
        type: "object",
        description: "Commit author",
        properties: {
          name: { type: "string", description: "Author name" },
          email: { type: "string", description: "Author email" },
        },
      },
    },
  },
  pullRequest: {
    type: "object",
    description: "Pull request details",
    properties: {
      number: { type: "number", description: "PR number" },
      title: { type: "string", description: "PR title" },
      state: { type: "string", description: "PR state (open/closed)" },
      merged: { type: "boolean", description: "Whether PR was merged" },
    },
  },
  issue: {
    type: "object",
    description: "Issue details",
    properties: {
      number: { type: "number", description: "Issue number" },
      title: { type: "string", description: "Issue title" },
      state: { type: "string", description: "Issue state (open/closed)" },
    },
  },
  comment: {
    type: "object",
    description: "Comment details",
    properties: {
      id: { type: "number", description: "Comment ID" },
      body: { type: "string", description: "Comment body" },
    },
  },
  review: {
    type: "object",
    description: "Review details",
    properties: {
      id: { type: "number", description: "Review ID" },
      state: { type: "string", description: "Review state (approved/changes_requested/commented)" },
      body: { type: "string", description: "Review body" },
    },
  },
  release: {
    type: "object",
    description: "Release details",
    properties: {
      id: { type: "number", description: "Release ID" },
      tagName: { type: "string", description: "Release tag name" },
      name: { type: "string", description: "Release name" },
    },
  },
} as const

const githubEventFields: Record<string, (keyof typeof githubFields)[]> = {
  push: ["event", "repository", "sender", "ref", "headCommit"],
  "create.branch": ["event", "repository", "sender", "ref", "refType"],
  "create.tag": ["event", "repository", "sender", "ref", "refType"],
  "delete.branch": ["event", "repository", "sender", "ref", "refType"],
  "delete.tag": ["event", "repository", "sender", "ref", "refType"],
  "pull_request.opened": ["event", "action", "repository", "sender", "pullRequest"],
  "pull_request.merged": ["event", "action", "repository", "sender", "pullRequest"],
  "pull_request.closed": ["event", "action", "repository", "sender", "pullRequest"],
  "pull_request.reopened": ["event", "action", "repository", "sender", "pullRequest"],
  "pull_request.synchronize": ["event", "action", "repository", "sender", "pullRequest"],
  "pull_request.ready_for_review": ["event", "action", "repository", "sender", "pullRequest"],
  "issues.opened": ["event", "action", "repository", "sender", "issue"],
  "issues.closed": ["event", "action", "repository", "sender", "issue"],
  "issues.reopened": ["event", "action", "repository", "sender", "issue"],
  "issue_comment.created": ["event", "action", "repository", "sender", "issue", "comment"],
  "pull_request_comment.created": ["event", "action", "repository", "sender", "pullRequest", "comment"],
  "pull_request_review.approved": ["event", "action", "repository", "sender", "pullRequest", "review"],
  "pull_request_review.changes_requested": ["event", "action", "repository", "sender", "pullRequest", "review"],
  "pull_request_review.commented": ["event", "action", "repository", "sender", "pullRequest", "review"],
  "release.published": ["event", "action", "repository", "sender", "release"],
}

const intercomFields = {
  event: { type: "string", description: "Event type (e.g. conversation.user.created)" },
  conversationId: { type: "string", description: "Conversation ID" },
  message: { type: "string", description: "Message body" },
  user: {
    type: "object",
    description: "User who sent the message",
    properties: {
      id: { type: "string", description: "User ID" },
      email: { type: "string", description: "User email" },
      name: { type: "string", description: "User name" },
    },
  },
  timestamp: { type: "number", description: "Event timestamp (Unix)" },
  appId: { type: "string", description: "Intercom workspace ID" },
} as const

const intercomEventFields: Record<string, (keyof typeof intercomFields)[]> = {
  "conversation.user.created": ["event", "conversationId", "message", "user", "timestamp", "appId"],
  "conversation.user.replied": ["event", "conversationId", "message", "user", "timestamp", "appId"],
  "conversation.admin.replied": ["event", "conversationId", "message", "user", "timestamp", "appId"],
  "conversation.admin.closed": ["event", "conversationId", "user", "timestamp", "appId"],
}

export function getPayloadSchemaForEvents(
  appId: string,
  events: string[],
): { type: "object"; properties: Record<string, unknown> } {
  if (appId === "github") {
    const fields = new Set<keyof typeof githubFields>()
    for (const event of events) {
      const eventFieldList = githubEventFields[event]
      if (eventFieldList) {
        for (const f of eventFieldList) fields.add(f)
      }
    }
    const properties: Record<string, unknown> = {}
    for (const f of fields) {
      properties[f] = githubFields[f]
    }
    return { type: "object", properties }
  }
  if (appId === "intercom") {
    const fields = new Set<keyof typeof intercomFields>()
    for (const event of events) {
      const eventFieldList = intercomEventFields[event]
      if (eventFieldList) {
        for (const f of eventFieldList) fields.add(f)
      }
    }
    const properties: Record<string, unknown> = {}
    for (const f of fields) {
      properties[f] = intercomFields[f]
    }
    return { type: "object", properties }
  }
  return { type: "object", properties: {} }
}

export const githubPayloadSchema = { type: "object", properties: githubFields }
export const intercomPayloadSchema = { type: "object", properties: intercomFields }
