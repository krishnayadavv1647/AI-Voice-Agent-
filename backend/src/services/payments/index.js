import { ApiError } from "../../utils/apiError.js";
import razorpay from "./razorpayProvider.js";
import stripe from "./stripeProvider.js";

const PROVIDERS = { razorpay, stripe };

// The active provider, chosen by PAYMENT_PROVIDER (defaults to razorpay per the product decision).
export function activeProviderName() {
  return process.env.PAYMENT_PROVIDER || "razorpay";
}

export function getPaymentProvider(name = activeProviderName()) {
  const provider = PROVIDERS[name];
  if (!provider) throw new ApiError(400, `Unsupported payment provider: ${name}`);
  if (!provider.isConfigured()) {
    throw new ApiError(503, `Payment provider "${name}" is not configured. Set its API keys to enable checkout.`, {
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED"
    });
  }
  return provider;
}

// Webhook handlers need the named provider even when it's the configured one; signature
// verification fails safely if keys are missing.
export function getProviderByName(name) {
  return PROVIDERS[name] || null;
}

export function listProviderStatus() {
  return Object.values(PROVIDERS).map((p) => ({ name: p.name, currency: p.currency, configured: p.isConfigured() }));
}
