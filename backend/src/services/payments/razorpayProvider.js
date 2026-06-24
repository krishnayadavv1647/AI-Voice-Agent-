import crypto from "crypto";

// Razorpay adapter. The SDK is imported lazily so the app boots even when the package or keys
// aren't configured yet. Razorpay works in the smallest currency unit (paise for INR).
export const name = "razorpay";
export const currency = "INR";

export function isConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

async function client() {
  const { default: Razorpay } = await import("razorpay");
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

// amount is in major units (e.g. rupees); Razorpay needs paise.
export async function createOrder({ amount, receipt, metadata = {} }) {
  const rzp = await client();
  const order = await rzp.orders.create({
    amount: Math.round(Number(amount) * 100),
    currency,
    receipt: String(receipt).slice(0, 40),
    notes: metadata
  });
  return {
    providerOrderId: order.id,
    clientPayload: {
      provider: name,
      orderId: order.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency
    }
  };
}

// Verifies a webhook body against RAZORPAY_WEBHOOK_SECRET and normalizes the event.
export function verifyWebhook({ rawBody, headers }) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = headers["x-razorpay-signature"];
  if (!secret || !signature) return { ok: false };

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected !== signature) return { ok: false };

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { ok: false };
  }

  const entity = payload?.payload?.payment?.entity || payload?.payload?.order?.entity || {};
  const paid = ["payment.captured", "order.paid"].includes(payload.event);
  return {
    ok: true,
    event: {
      type: payload.event,
      status: paid ? "paid" : "ignored",
      orderId: entity.order_id || entity.id || null,
      paymentId: entity.id || null
    }
  };
}

// Verifies the client-side success handshake: HMAC(order_id|payment_id, key_secret).
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return { ok: expected === signature, orderId, paymentId };
}

export default { name, currency, isConfigured, createOrder, verifyWebhook, verifyCheckoutSignature };
