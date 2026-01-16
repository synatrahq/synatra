import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { magicLink, organization } from "better-auth/plugins"
import {
  principal,
  db,
  schema,
  addChannelMemberToDefaults,
  getInvitationEmailData,
  isOwnerMember,
  checkUserLimit,
  createManyEnvironments,
  ensureManagedResource,
  createManyChannels,
  findDefaultChannels,
  ac,
  ownerRole,
  adminRole,
  builderRole,
  memberRole,
} from "@synatra/core"
import { PRODUCTION_ENV, STAGING_ENV, type DefaultEnvironment } from "@synatra/core/types"
import { APIError } from "better-auth/api"
import { isAppError } from "@synatra/util/error"
import { config } from "./config"

const roles = {
  owner: ownerRole,
  admin: adminRole,
  builder: builderRole,
  member: memberRole,
}

const DEFAULT_CHANNELS = [{ name: "General", slug: "general", isDefault: true }] as const

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function logEmailForDev(type: string, to: string, url: string) {
  console.log("\n" + "=".repeat(60))
  console.log(`📧 [DEV] ${type}`)
  console.log("=".repeat(60))
  console.log(`To: ${to}`)
  console.log(`URL: ${url}`)
  console.log("=".repeat(60) + "\n")
}

function isDevEmail() {
  const resend = config().resend
  return !resend || resend.fromEmail === "onboarding@resend.dev"
}

async function sendEmail(to: string, subject: string, html: string) {
  const resend = config().resend
  if (!resend) return false
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resend.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: resend.fromEmail, to, subject, html }),
  })
  if (response.ok) return true
  const body = await response.text()
  throw new Error(`Failed to send email: ${body}`)
}

async function sendMagicLinkEmail(email: string, url: string) {
  if (isDevEmail()) {
    logEmailForDev("Magic Link", email, url)
    return
  }
  const html = `
    <div style="padding: 48px 24px;">
      <div style="max-width: 400px; margin: 0 auto;">
        <p style="font-family: system-ui, -apple-system, sans-serif; font-size: 15px; font-weight: 600; color: #111; margin: 0 0 32px 0; letter-spacing: -0.02em;">Synatra</p>
        <p style="font-family: Georgia, serif; font-size: 15px; color: #111; margin: 0 0 6px 0; line-height: 1.6;">Your agents are waiting. Let's get started.</p>
        <p style="font-family: Georgia, serif; font-size: 14px; color: #666; margin: 0 0 20px 0;">Sign in to your account</p>
        <a href="${url}" style="font-family: system-ui, sans-serif; font-size: 13px; color: #111; text-decoration: underline;">Sign in &rarr;</a>
      </div>
    </div>
  `
  await sendEmail(email, "Sign in to Synatra", html)
}

async function sendWelcomeEmail(email: string, name: string | null) {
  if (isDevEmail()) {
    console.log("\n" + "=".repeat(60))
    console.log("📧 [DEV] Welcome Email")
    console.log("=".repeat(60))
    console.log(`To: ${email}`)
    console.log("=".repeat(60) + "\n")
    return
  }
  const userName = name ? escapeHtml(name) : "there"
  const html = `
    <div style="padding: 48px 24px;">
      <div style="max-width: 400px; margin: 0 auto;">
        <p style="font-family: system-ui, -apple-system, sans-serif; font-size: 15px; font-weight: 600; color: #111; margin: 0 0 32px 0; letter-spacing: -0.02em;">Synatra</p>
        <p style="font-family: Georgia, serif; font-size: 15px; color: #111; margin: 0 0 6px 0; line-height: 1.6;">Hey ${userName}, welcome to Synatra!</p>
        <p style="font-family: Georgia, serif; font-size: 14px; color: #666; margin: 0 0 20px 0; line-height: 1.6;">We're building something new and your feedback means everything. Got ideas, bugs, or just want to say hi?</p>
        <a href="https://github.com/synatrahq/synatra/discussions" style="font-family: system-ui, sans-serif; font-size: 13px; color: #111; text-decoration: underline;">Join the discussion &rarr;</a>
      </div>
    </div>
  `
  await sendEmail(email, "Welcome to Synatra", html)
}

async function sendInvitationEmail(data: {
  id: string
  email: string
  inviter: { user: { name: string; email: string } }
  organization: { name: string }
}) {
  const baseUrl = config().app.origins[0] || "http://localhost:5173"
  const email = encodeURIComponent(data.email)
  const org = encodeURIComponent(data.organization.name)
  const url = `${baseUrl}/accept-invitation/${data.id}?email=${email}&org=${org}`
  if (isDevEmail()) {
    logEmailForDev("Invitation", data.email, url)
    return
  }
  const orgName = escapeHtml(data.organization.name)
  const inviterName = escapeHtml(data.inviter.user.name || data.inviter.user.email)
  const html = `
    <div style="padding: 48px 24px;">
      <div style="max-width: 400px; margin: 0 auto;">
        <p style="font-family: system-ui, -apple-system, sans-serif; font-size: 15px; font-weight: 600; color: #111; margin: 0 0 32px 0; letter-spacing: -0.02em;">Synatra</p>
        <p style="font-family: Georgia, serif; font-size: 15px; color: #111; margin: 0 0 6px 0; line-height: 1.6;">Your agents are waiting. Let's get started.</p>
        <p style="font-family: Georgia, serif; font-size: 14px; color: #666; margin: 0 0 20px 0;">${inviterName} invited you to ${orgName}.</p>
        <a href="${url}" style="font-family: system-ui, sans-serif; font-size: 13px; color: #111; text-decoration: underline;">Accept &rarr;</a>
      </div>
    </div>
  `
  await sendEmail(data.email, `Join ${orgName} on Synatra`, html)
}

export async function sendBulkInvitationEmails(invitationIds: string[]) {
  const data = await getInvitationEmailData({ invitationIds })

  await Promise.all(
    data.invitations.map((invitation) =>
      sendInvitationEmail({
        id: invitation.id,
        email: invitation.email,
        inviter: { user: { name: data.inviter.name, email: data.inviter.email } },
        organization: { name: data.organization.name },
      }),
    ),
  )
}

function googleConfig() {
  const google = config().google
  if (!google) return undefined
  return {
    google: {
      clientId: google.clientId,
      clientSecret: google.clientSecret,
    },
  }
}

export const auth = betterAuth({
  secret: config().auth.secret,
  baseURL: config().auth.baseUrl,
  trustedOrigins: config().app.origins,
  database: drizzleAdapter(db(), { schema, provider: "pg" }),
  socialProviders: googleConfig(),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          sendWelcomeEmail(user.email, user.name).catch((e) => console.error("Failed to send welcome email:", e))
        },
      },
    },
  },
  plugins: [
    organization({
      ac,
      roles,
      sendInvitationEmail,
      organizationHooks: {
        afterCreateOrganization: async ({ organization: org, user }) => {
          return principal.withSystem({ organizationId: org.id, actingUserId: user.id }, async () => {
            const environments = [PRODUCTION_ENV, STAGING_ENV]

            await Promise.all([
              ensureManagedResource("synatra_ai"),
              createManyEnvironments(
                environments.map((env) => ({
                  organizationId: org.id,
                  name: env.name,
                  slug: env.slug,
                  color: env.color,
                  protected: env.protected,
                  createdBy: user.id,
                })),
              ),
              createManyChannels(
                DEFAULT_CHANNELS.map((ch) => ({
                  organizationId: org.id,
                  name: ch.name,
                  slug: ch.slug,
                  isDefault: ch.isDefault,
                  createdBy: user.id,
                })),
              ),
            ])
          })
        },
      },
      memberHooks: {
        beforeAcceptInvitation: async ({
          user,
          organization,
        }: {
          invitation: { id: string; organizationId: string }
          user: { id: string }
          organization: { id: string }
        }) => {
          return principal.withSystem({ organizationId: organization.id, actingUserId: user.id }, async () => {
            try {
              await checkUserLimit()
            } catch (error) {
              if (isAppError(error) && error.name === "ResourceLimitError") {
                throw new APIError("FORBIDDEN", {
                  message: `User limit reached (${(error.data as { limit: number }).limit}). Upgrade your plan to add more users.`,
                })
              }
              throw error
            }
          })
        },
        afterAddMember: async ({ member }: { member: { id: string; organizationId: string; userId: string } }) => {
          return principal.withSystem(
            { organizationId: member.organizationId, actingUserId: member.userId },
            async () => {
              const channels = await findDefaultChannels(member.organizationId)
              await addChannelMemberToDefaults({
                memberId: member.id,
                channelIds: channels.map((c) => c.id),
                createdBy: member.userId,
              })
            },
          )
        },
        beforeUpdateMemberRole: async ({
          member,
          newRole,
          user,
        }: {
          member: { organizationId: string }
          newRole: string
          user: { id: string }
        }) => {
          if (newRole !== "owner") return
          return principal.withSystem({ organizationId: member.organizationId, actingUserId: user.id }, async () => {
            const isOwner = await isOwnerMember({
              userId: user.id,
              organizationId: member.organizationId,
            })
            if (!isOwner) {
              throw new APIError("FORBIDDEN", { message: "Only owners can promote to owner" })
            }
          })
        },
      },
    }),
    magicLink({
      sendMagicLink: async ({ email, url }: { email: string; url: string }) => {
        await sendMagicLinkEmail(email, url)
      },
    }),
  ],
  advanced: {
    database: {
      generateId: false,
    },
    crossSubDomainCookies: {
      enabled: true,
      domains: config().app.cookieDomain ? [config().app.cookieDomain] : undefined,
    },
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: config().auth.baseUrl.startsWith("https"),
      domain: config().app.cookieDomain,
    },
  },
})
