import { createHmac, timingSafeEqual } from "crypto"
import type { AppDefinition } from "@synatra/core/types"

export const intercom: AppDefinition = {
  id: "intercom",
  name: "Intercom",
  authType: "oauth2",
  oauth: {
    authUrl: "https://app.intercom.com/oauth",
    tokenUrl: "https://api.intercom.io/auth/eagle/token",
    scopes: ["read_users", "write_users", "read_conversations", "write_conversations", "read_tags", "write_tags"],
  },
  events: [
    {
      id: "conversation.user.created",
      name: "New conversation",
      description: "Triggered when a customer starts a new conversation",
    },
    {
      id: "conversation.user.replied",
      name: "Customer replied",
      description: "Triggered when a customer sends a message",
    },
    {
      id: "conversation.admin.replied",
      name: "Admin replied",
      description: "Triggered when an admin sends a message",
    },
    {
      id: "conversation.admin.closed",
      name: "Conversation closed",
      description: "Triggered when an admin closes a conversation",
    },
  ],
  webhookSecretHeader: "x-hub-signature",
}

export type IntercomWebhookPayload = {
  type: "notification_event"
  topic: string
  id: string
  app_id: string
  created_at: number
  data: {
    type: "notification_event_data"
    item: {
      type: "conversation"
      id: string
      source?: {
        body?: string
        author?: {
          type: string
          id: string
          email?: string
          name?: string
        }
      }
    }
  }
}

export function verifyIntercomSignature(payload: string, signature: string, secret: string): boolean {
  const expected = "sha1=" + createHmac("sha1", secret).update(payload).digest("hex")
  const sig = Buffer.from(signature)
  const exp = Buffer.from(expected)
  if (sig.length !== exp.length) return false
  return timingSafeEqual(sig, exp)
}

export function normalizeIntercomPayload(raw: IntercomWebhookPayload) {
  return {
    event: raw.topic,
    conversationId: raw.data.item.id,
    message: raw.data.item.source?.body,
    user: {
      id: raw.data.item.source?.author?.id,
      email: raw.data.item.source?.author?.email,
      name: raw.data.item.source?.author?.name,
    },
    timestamp: raw.created_at,
    appId: raw.app_id,
    raw,
  }
}
