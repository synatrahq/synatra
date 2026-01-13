import { Hono } from "hono"
import { current } from "./current"
import { createCheckout } from "./create-checkout"
import { changePlan } from "./change-plan"
import { cancelSchedule } from "./cancel-schedule"
import { billingPortal } from "./billing-portal"
import { webhook } from "./webhook"

export const subscriptions = new Hono()
  .route("/", current)
  .route("/", createCheckout)
  .route("/", changePlan)
  .route("/", cancelSchedule)
  .route("/", billingPortal)

export const subscriptionsWebhook = webhook
