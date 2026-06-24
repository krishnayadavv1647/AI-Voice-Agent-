// Stripe adapter. SDK imported lazily so the app boots without the package/keys configured.
// Uses Stripe Checkout Sessions; the client redirects to the returned URL.
export const name = "stripe";
export const currency = "USD";

export function isConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function client() {
  const { default: Stripe } = await import("stripe");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function appUrl() {
  return (process.env.PUBLIC_FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

// amount is in major units (e.g. dollars); Stripe needs cents.
export async function createOrder({ amount, label, metadata = {} }) {
  const stripe = await client();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: currency.toLowerCase(),
          product_data: { name: label || "Credits" },
          unit_amount: Math.round(Number(amount) * 100)
        },
        quantity: 1
      }
    ],
    metadata,
    success_url: `${appUrl()}/credits?checkout=success`,
    cancel_url: `${appUrl()}/billing?checkout=cancelled`
  });
  return {
    providerOrderId: session.id,
    clientPayload: { provider: name, url: session.url, sessionId: session.id }
  };
}

export async function verifyWebhook({ rawBody, headers }) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = headers["stripe-signature"];
  if (!secret || !signature) return { ok: false };

  const stripe = await client();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return { ok: false };
  }

  if (event.type !== "checkout.session.completed") {
    return { ok: true, event: { type: event.type, status: "ignored" } };
  }
  const session = event.data.object;
  return {
    ok: true,
    event: {
      type: event.type,
      status: session.payment_status === "paid" ? "paid" : "ignored",
      orderId: session.id,
      paymentId: session.payment_intent || session.id
    }
  };
}

// Stripe has no client-side signature handshake; the webhook is authoritative.
export function verifyCheckoutSignature() {
  return { ok: false };
}

export default { name, currency, isConfigured, createOrder, verifyWebhook, verifyCheckoutSignature };
