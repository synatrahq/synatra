import { Hono } from "hono"
import { current } from "./current"
import { createCheckout } from "./create-checkout"
import { verifyCheckout } from "./verify-checkout"
import { changePlan } from "./change-plan"
import { cancel } from "./cancel"
import { resume } from "./resume"
import { cancelSchedule } from "./cancel-schedule"
import { billingPortal } from "./billing-portal"
import { webhook } from "./webhook"

export const subscriptions = new Hono()
  .route("/", current)
  .route("/", createCheckout)
  .route("/", verifyCheckout)
  .route("/", changePlan)
  .route("/", cancel)
  .route("/", resume)
  .route("/", cancelSchedule)
  .route("/", billingPortal)

export const subscriptionsWebhook = webhook
