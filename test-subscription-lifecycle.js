import stripe from './config/stripe.js';

/**
 * Test script to understand Stripe subscription lifecycle
 * This demonstrates the order of events and subscription statuses
 */

async function testSubscriptionLifecycle() {
    console.log('🧪 Testing Stripe Subscription Lifecycle\n');

    try {
        // 1. Create a test customer
        console.log('1️⃣ Creating test customer...');
        const customer = await stripe.customers.create({
            email: 'test-subscription-lifecycle@example.com',
            name: 'Test Customer'
        });
        console.log(`✅ Customer created: ${customer.id}\n`);

        // 2. Create a subscription (this simulates what happens after checkout)
        console.log('2️⃣ Creating subscription (simulating post-checkout)...');
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: process.env.STRIPE_PRICE_ID }],
            payment_behavior: 'default_incomplete', // This creates an incomplete subscription
            expand: ['latest_invoice.payment_intent']
        });

        console.log(`✅ Subscription created: ${subscription.id}`);
        console.log(`📊 Initial status: ${subscription.status}`);
        console.log(`💰 Invoice status: ${subscription.latest_invoice.status}`);
        console.log(`💳 Payment intent status: ${subscription.latest_invoice.payment_intent.status}\n`);

        // 3. Simulate what happens when payment succeeds
        console.log('3️⃣ Simulating successful payment...');

        // Retrieve the latest invoice
        const invoice = await stripe.invoices.retrieve(subscription.latest_invoice.id);
        console.log(`📋 Invoice ID: ${invoice.id}`);
        console.log(`📊 Invoice status: ${invoice.status}`);

        // 4. Show what the subscription looks like after payment
        console.log('\n4️⃣ Retrieving updated subscription...');
        const updatedSubscription = await stripe.subscriptions.retrieve(subscription.id);
        console.log(`📊 Updated subscription status: ${updatedSubscription.status}`);
        console.log(`📅 Current period end: ${new Date(updatedSubscription.current_period_end * 1000).toISOString()}`);

        // 5. Clean up
        console.log('\n5️⃣ Cleaning up test data...');
        await stripe.subscriptions.del(subscription.id);
        await stripe.customers.del(customer.id);
        console.log('✅ Test data cleaned up');

        console.log('\n📋 SUMMARY:');
        console.log('• subscription.created fires IMMEDIATELY when subscription is created');
        console.log('• Status is "incomplete" until payment is processed');
        console.log('• invoice.payment_succeeded fires when payment completes');
        console.log('• subscription.updated fires with status "active" after payment');
        console.log('• Your webhook should NOT activate subscription on "incomplete" status');
        console.log('• Only activate when status becomes "active"');

    } catch (error) {
        console.error('❌ Error in test:', error);
    }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testSubscriptionLifecycle();
}

export default testSubscriptionLifecycle; 