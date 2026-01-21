import { z } from 'zod';

const envSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required"),
  STRIPE_PRO_PRICE_ID_MONTHLY: z.string().min(1, "STRIPE_PRO_PRICE_ID_MONTHLY is required"),
  STRIPE_PRO_PRICE_ID_YEARLY: z.string().min(1, "STRIPE_PRO_PRICE_ID_YEARLY is required"),
  STRIPE_CUSTOMER_PORTAL_RETURN_URL: z.string().url("STRIPE_CUSTOMER_PORTAL_RETURN_URL must be a valid URL"),
  STRIPE_CHECKOUT_SUCCESS_URL: z.string().url("STRIPE_CHECKOUT_SUCCESS_URL must be a valid URL"),
  STRIPE_CHECKOUT_CANCEL_URL: z.string().url("STRIPE_CHECKOUT_CANCEL_URL must be a valid URL"),
});

const processEnv = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRO_PRICE_ID_MONTHLY: process.env.STRIPE_PRO_PRICE_ID_MONTHLY,
  STRIPE_PRO_PRICE_ID_YEARLY: process.env.STRIPE_PRO_PRICE_ID_YEARLY,
  STRIPE_CUSTOMER_PORTAL_RETURN_URL: process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL,
  STRIPE_CHECKOUT_SUCCESS_URL: process.env.STRIPE_CHECKOUT_SUCCESS_URL,
  STRIPE_CHECKOUT_CANCEL_URL: process.env.STRIPE_CHECKOUT_CANCEL_URL,
};

export function validateBillingEnv() {
  const result = envSchema.safeParse(processEnv);
  if (!result.success) {
    throw new Error("Missing or invalid Billing environment variables: " + JSON.stringify(result.error.flatten().fieldErrors));
  }
  return result.data;
}
