import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});

// Create customer portal session
export async function createCustomerPortalSession(customerId, returnUrl) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    });

    return session;
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    throw error;
  }
}

// Verify webhook signature
export function verifyWebhookSignature(payload, signature, secret) {
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    throw error;
  }
}

export default stripe; 