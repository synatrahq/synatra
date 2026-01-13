import Stripe from "stripe"
import { config } from "./config"

let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeClient) {
    const stripeConfig = config().stripe
    if (!stripeConfig) {
      throw new Error("Stripe is not configured")
    }
    stripeClient = new Stripe(stripeConfig.secretKey, {
      apiVersion: "2025-11-17.clover",
    })
  }
  return stripeClient
}
