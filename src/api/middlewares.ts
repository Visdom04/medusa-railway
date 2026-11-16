import {
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"

// SkillUp Exchange: Stripe is the only way to pay.
// Medusa 2.13 lets a store cart open a payment session with any provider,
// even one removed from the region. The built-in system provider
// (pp_system_default) "pays" without taking money, so a cart could be
// completed for free. Reject every non-Stripe session at the store API.
const ALLOWED_PROVIDER_IDS = new Set(
  (process.env.ALLOWED_PAYMENT_PROVIDER_IDS ?? "pp_stripe_stripe")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
)

function requireStripeProvider(
  req: MedusaRequest<{ provider_id?: string }>,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const providerId = req.body?.provider_id

  if (!providerId || !ALLOWED_PROVIDER_IDS.has(providerId)) {
    res.status(400).json({
      type: "invalid_data",
      message: "This payment provider is not allowed.",
    })
    return
  }

  next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/payment-collections/:id/payment-sessions",
      method: ["POST"],
      middlewares: [requireStripeProvider],
    },
  ],
})
