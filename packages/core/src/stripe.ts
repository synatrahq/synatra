import Stripe from "stripe"
import { config } from "./config"

let stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (stripe) return stripe
  const cfg = config().stripe
  if (!cfg) throw new Error("Stripe is not configured")
  stripe = new Stripe(cfg.secretKey.trim(), { apiVersion: "2025-11-17.clover" })
  return stripe
}

export function getStripeOrNull(): Stripe | null {
  if (stripe) return stripe
  const cfg = config().stripe
  if (!cfg) return null
  stripe = new Stripe(cfg.secretKey.trim(), { apiVersion: "2025-11-17.clover" })
  return stripe
}
