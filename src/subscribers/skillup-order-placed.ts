import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

type OrderPlacedEvent = {
  id: string
}

type SkillupWebhookOrder = {
  id: string
  metadata?: Record<string, unknown> | null
  items?: Array<{
    id?: string
    variant_sku?: string | null
    metadata?: Record<string, unknown> | null
    variant?: {
      sku?: string | null
      metadata?: Record<string, unknown> | null
    } | null
  }>
}

function buildWebhookPayload(order: SkillupWebhookOrder) {
  return {
    type: "order.placed",
    data: {
      id: order.id,
      metadata: order.metadata ?? {},
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        variant_sku: item.variant_sku ?? item.variant?.sku ?? null,
        metadata: item.metadata ?? {},
        variant: item.variant
          ? {
              sku: item.variant.sku ?? null,
              metadata: item.variant.metadata ?? {},
            }
          : null,
      })),
    },
  }
}

export default async function skillupOrderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEvent>) {
  const logger = container.resolve("logger")
  const webhookUrl = process.env.SKILLUP_WEBHOOK_URL
  const webhookSecret = process.env.SKILLUP_WEBHOOK_SECRET

  if (!webhookUrl || !webhookSecret) {
    logger.warn(
      "[skillup] SKILLUP_WEBHOOK_URL or SKILLUP_WEBHOOK_SECRET not set — skipping entitlement webhook"
    )
    return
  }

  const query = container.resolve("query")

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "metadata", "items.*", "items.variant.*"],
    filters: {
      id: data.id,
    },
  })

  const order = orders?.[0] as SkillupWebhookOrder | undefined

  if (!order?.id) {
    logger.error(
      { orderId: data.id },
      "[skillup] order not found for order.placed event"
    )
    return
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-skillup-commerce-secret": webhookSecret,
    },
    body: JSON.stringify(buildWebhookPayload(order)),
  })

  if (!response.ok) {
    const body = await response.text()

    logger.error(
      {
        orderId: order.id,
        status: response.status,
        body: body.slice(0, 500),
      },
      "[skillup] entitlement webhook failed"
    )

    throw new Error(
      `[skillup] webhook failed ${response.status}: ${body.slice(0, 300)}`
    )
  }

  const result = (await response.json().catch(() => null)) as {
    granted?: number
  } | null

  logger.info(
    {
      orderId: order.id,
      granted: result?.granted ?? 0,
    },
    "[skillup] entitlement webhook delivered"
  )
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
