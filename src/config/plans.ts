import type { SubscriptionPlan } from "../types/index.js";

// Stripe Price IDs from environment
export const ANNUAL_PRICE_ID = process.env.STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID;

export const MONTHLY_PRICE_ID = process.env.STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID;

/**
 * Get subscription plan configuration
 * Returns both monthly and annual plans with pricing and features
 */
export function getSubscriptionPlans(): SubscriptionPlan[] {
  if (!ANNUAL_PRICE_ID || !MONTHLY_PRICE_ID) {
    throw new Error("Stripe price IDs are not configured");
  }

  // Get plan configuration from environment variables
  const annualPlanPrice = parseFloat(process.env.ANNUAL_PLAN_PRICE || "100.00");
  const monthlyPlanPrice = parseFloat(
    process.env.MONTHLY_PLAN_PRICE || "10.00"
  );
  const annualPlanName = process.env.ANNUAL_PLAN_NAME || "Premium VPN - Annual";
  const monthlyPlanName =
    process.env.MONTHLY_PLAN_NAME || "Premium VPN - Monthly";
  const planFeatures = process.env.PLAN_FEATURES
    ? process.env.PLAN_FEATURES.split(",")
    : [
        "Unlimited bandwidth",
        "Global servers",
        "Premium support",
        "No logs policy",
      ];

  const plans: SubscriptionPlan[] = [
    {
      id: "premium_monthly",
      name: monthlyPlanName,
      price: monthlyPlanPrice,
      period: "month",
      interval: "month",
      billingPeriod: "month",
      features: planFeatures,
      priceId: MONTHLY_PRICE_ID,
    },
    {
      id: "premium_yearly",
      name: annualPlanName,
      price: annualPlanPrice,
      period: "year",
      interval: "year",
      billingPeriod: "year",
      features: planFeatures,
      priceId: ANNUAL_PRICE_ID,
    },
  ];

  return plans;
}

/**
 * Get plan details by plan ID
 */
export function getPlanById(planId: string): SubscriptionPlan | null {
  const plans = getSubscriptionPlans();
  return plans.find((plan) => plan.id === planId) || null;
}

/**
 * Get Stripe price ID for a given plan
 */
export function getPriceIdForPlan(
  planId: "premium_monthly" | "premium_yearly"
): string {
  if (!ANNUAL_PRICE_ID || !MONTHLY_PRICE_ID) {
    throw new Error("Stripe price IDs are not configured");
  }

  return planId === "premium_monthly" ? MONTHLY_PRICE_ID! : ANNUAL_PRICE_ID!;
}

/**
 * Get plan name for a given plan ID
 */
export function getPlanName(
  planId: "premium_monthly" | "premium_yearly"
): string {
  const plan = getPlanById(planId);
  return plan?.name || "Premium VPN";
}

/**
 * Get billing period for a given plan ID
 */
export function getBillingPeriod(
  planId: "premium_monthly" | "premium_yearly"
): "month" | "year" {
  return planId === "premium_monthly" ? "month" : "year";
}
