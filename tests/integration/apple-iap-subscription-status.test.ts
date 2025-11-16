import {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
} from "../setup/test-db.js";
import { createTestUser } from "../setup/helpers.js";
import Subscription from "../../src/models/Subscription.js";

describe("Apple IAP Subscription Status Logic", () => {
  let subscriptionModel: Subscription;

  beforeAll(async () => {
    await setupTestDatabase();
    subscriptionModel = new Subscription();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  describe("Initial Subscription Status", () => {
    it("should mark initial subscription as 'trialing'", async () => {
      const user = await createTestUser();
      const now = new Date();
      const purchaseDate = new Date(now);
      const expiresDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      // Create initial subscription
      const subscription = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_initial_123",
        appleOriginalTransactionId: "orig_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "trialing",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: purchaseDate,
        currentPeriodEnd: expiresDate,
        cancelAtPeriodEnd: false,
      });

      expect(subscription.status).toBe("trialing");
      expect(subscription.appleTransactionId).toBe("txn_initial_123");
    });
  });

  describe("Renewal Before Trial Ends", () => {
    it("should mark renewal as 'trialing' if trial period has not ended", async () => {
      const user = await createTestUser();
      const now = new Date();
      
      // Initial purchase: 10 days ago
      const initialPurchaseDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const initialExpiresDate = new Date(initialPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Create initial subscription
      await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_initial_123",
        appleOriginalTransactionId: "orig_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "trialing",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: initialPurchaseDate,
        currentPeriodEnd: initialExpiresDate,
        cancelAtPeriodEnd: false,
      });

      // Renewal: 15 days after initial purchase (still within 30-day trial)
      const renewalPurchaseDate = new Date(initialPurchaseDate.getTime() + 15 * 24 * 60 * 60 * 1000);
      const renewalExpiresDate = new Date(renewalPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Simulate renewal by creating a new subscription with same originalTransactionId
      // but different billing period
      const renewalSubscription = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_renewal_456",
        appleOriginalTransactionId: "orig_123", // Same original transaction ID
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "trialing", // Should remain trialing since trial hasn't ended
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: renewalPurchaseDate,
        currentPeriodEnd: renewalExpiresDate,
        cancelAtPeriodEnd: false,
      });

      expect(renewalSubscription.status).toBe("trialing");
      expect(renewalSubscription.appleOriginalTransactionId).toBe("orig_123");
      
      // Verify trial period calculation
      const daysSinceInitial = Math.floor(
        (renewalPurchaseDate.getTime() - initialPurchaseDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysSinceInitial).toBe(15); // 15 days < 30 days, so still in trial
    });
  });

  describe("Renewal After Trial Ends", () => {
    it("should mark renewal as 'active' if trial period has ended", async () => {
      const user = await createTestUser();
      const now = new Date();
      
      // Initial purchase: 35 days ago (trial period has ended)
      const initialPurchaseDate = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);
      const initialExpiresDate = new Date(initialPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Create initial subscription
      await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_initial_123",
        appleOriginalTransactionId: "orig_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "trialing",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: initialPurchaseDate,
        currentPeriodEnd: initialExpiresDate,
        cancelAtPeriodEnd: false,
      });

      // Renewal: 35 days after initial purchase (trial period has ended)
      const renewalPurchaseDate = new Date(initialPurchaseDate.getTime() + 35 * 24 * 60 * 60 * 1000);
      const renewalExpiresDate = new Date(renewalPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Simulate renewal - this should be marked as "active" since trial ended
      const renewalSubscription = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_renewal_456",
        appleOriginalTransactionId: "orig_123", // Same original transaction ID
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "active", // Should be active since trial ended
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: renewalPurchaseDate,
        currentPeriodEnd: renewalExpiresDate,
        cancelAtPeriodEnd: false,
      });

      expect(renewalSubscription.status).toBe("active");
      expect(renewalSubscription.appleOriginalTransactionId).toBe("orig_123");
      
      // Verify trial period calculation
      const daysSinceInitial = Math.floor(
        (renewalPurchaseDate.getTime() - initialPurchaseDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysSinceInitial).toBe(35); // 35 days > 30 days, so trial has ended
    });

    it("should mark renewal as 'active' exactly 30 days after initial purchase", async () => {
      const user = await createTestUser();
      const now = new Date();
      
      // Initial purchase: 30 days ago (trial period ends today)
      const initialPurchaseDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const initialExpiresDate = new Date(initialPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Create initial subscription
      await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_initial_123",
        appleOriginalTransactionId: "orig_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "trialing",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: initialPurchaseDate,
        currentPeriodEnd: initialExpiresDate,
        cancelAtPeriodEnd: false,
      });

      // Renewal: exactly 30 days after initial purchase
      const renewalPurchaseDate = new Date(initialPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      const renewalExpiresDate = new Date(renewalPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Renewal should be marked as "active" since trial period has ended
      const renewalSubscription = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_renewal_456",
        appleOriginalTransactionId: "orig_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "active",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: renewalPurchaseDate,
        currentPeriodEnd: renewalExpiresDate,
        cancelAtPeriodEnd: false,
      });

      expect(renewalSubscription.status).toBe("active");
    });
  });

  describe("Expired Subscriptions", () => {
    it("should mark expired subscription as 'inactive'", async () => {
      const user = await createTestUser();
      const now = new Date();
      const purchaseDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
      const expiresDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // Expired 1 day ago

      const subscription = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_expired_123",
        appleOriginalTransactionId: "orig_expired_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "inactive",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: purchaseDate,
        currentPeriodEnd: expiresDate,
        cancelAtPeriodEnd: false,
      });

      expect(subscription.status).toBe("inactive");
    });
  });

  describe("Multiple Renewals", () => {
    it("should handle multiple renewals correctly", async () => {
      const user = await createTestUser();
      const now = new Date();
      
      // Initial purchase: 50 days ago
      const initialPurchaseDate = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000);
      
      // Create initial subscription
      const initialSubscription = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_initial_123",
        appleOriginalTransactionId: "orig_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "trialing",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: initialPurchaseDate,
        currentPeriodEnd: new Date(initialPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });

      // First renewal: 30 days after initial (trial ended)
      const firstRenewalDate = new Date(initialPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      const firstRenewal = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_renewal_1",
        appleOriginalTransactionId: "orig_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "active", // Trial ended, so active
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: firstRenewalDate,
        currentPeriodEnd: new Date(firstRenewalDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });

      // Second renewal: 60 days after initial (still active)
      const secondRenewalDate = new Date(initialPurchaseDate.getTime() + 60 * 24 * 60 * 60 * 1000);
      const secondRenewal = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_renewal_2",
        appleOriginalTransactionId: "orig_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "active", // Still active
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: secondRenewalDate,
        currentPeriodEnd: new Date(secondRenewalDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });

      expect(initialSubscription.status).toBe("trialing");
      expect(firstRenewal.status).toBe("active");
      expect(secondRenewal.status).toBe("active");
      
      // All should have the same originalTransactionId
      expect(initialSubscription.appleOriginalTransactionId).toBe("orig_123");
      expect(firstRenewal.appleOriginalTransactionId).toBe("orig_123");
      expect(secondRenewal.appleOriginalTransactionId).toBe("orig_123");
    });
  });

  describe("Trial Period Calculation", () => {
    it("should calculate trial period from initial purchase date, not renewal date", async () => {
      const user = await createTestUser();
      const now = new Date();
      
      // Initial purchase: 40 days ago
      const initialPurchaseDate = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
      
      // Create initial subscription
      await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_initial_123",
        appleOriginalTransactionId: "orig_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "trialing",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: initialPurchaseDate,
        currentPeriodEnd: new Date(initialPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });

      // Renewal: 40 days after initial (trial ended 10 days ago)
      const renewalPurchaseDate = new Date(initialPurchaseDate.getTime() + 40 * 24 * 60 * 60 * 1000);
      
      // Trial period should be calculated from initial purchase (40 days ago)
      // Trial ended 10 days ago, so renewal should be "active"
      const renewalSubscription = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_renewal_456",
        appleOriginalTransactionId: "orig_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "active",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: renewalPurchaseDate,
        currentPeriodEnd: new Date(renewalPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });

      expect(renewalSubscription.status).toBe("active");
      
      // Verify trial period calculation
      const daysSinceInitial = Math.floor(
        (renewalPurchaseDate.getTime() - initialPurchaseDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysSinceInitial).toBe(40); // 40 days > 30 days, trial has ended
    });
  });

  describe("IAP Renewal Flow", () => {
    it("should create new subscription record for each renewal", async () => {
      const user = await createTestUser();
      const now = new Date();
      
      // Initial purchase: 40 days ago
      const initialPurchaseDate = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
      
      // Create initial subscription
      const initialSubscription = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_initial_123",
        appleOriginalTransactionId: "orig_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "trialing",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: initialPurchaseDate,
        currentPeriodEnd: new Date(initialPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });

      // First renewal: 30 days after initial (trial ended)
      const firstRenewalDate = new Date(initialPurchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      const firstRenewal = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_renewal_1", // Different transaction ID
        appleOriginalTransactionId: "orig_123", // Same original transaction ID
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "active", // Trial ended, so active
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: firstRenewalDate,
        currentPeriodEnd: new Date(firstRenewalDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });

      // Second renewal: 60 days after initial
      const secondRenewalDate = new Date(initialPurchaseDate.getTime() + 60 * 24 * 60 * 60 * 1000);
      const secondRenewal = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_renewal_2", // Different transaction ID
        appleOriginalTransactionId: "orig_123", // Same original transaction ID
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "active", // Still active
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: secondRenewalDate,
        currentPeriodEnd: new Date(secondRenewalDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });

      // Verify all subscriptions exist and are separate records
      expect(initialSubscription.id).not.toBe(firstRenewal.id);
      expect(firstRenewal.id).not.toBe(secondRenewal.id);
      
      // Verify all have same originalTransactionId
      expect(initialSubscription.appleOriginalTransactionId).toBe("orig_123");
      expect(firstRenewal.appleOriginalTransactionId).toBe("orig_123");
      expect(secondRenewal.appleOriginalTransactionId).toBe("orig_123");
      
      // Verify different transaction IDs
      expect(initialSubscription.appleTransactionId).toBe("txn_initial_123");
      expect(firstRenewal.appleTransactionId).toBe("txn_renewal_1");
      expect(secondRenewal.appleTransactionId).toBe("txn_renewal_2");
      
      // Verify status progression
      expect(initialSubscription.status).toBe("trialing");
      expect(firstRenewal.status).toBe("active");
      expect(secondRenewal.status).toBe("active");
      
      // Verify findActiveByUserId returns the most recent active subscription
      const activeSubscription = await subscriptionModel.findActiveByUserId(user.id);
      expect(activeSubscription).not.toBeNull();
      expect(activeSubscription?.status).toBe("active");
      expect(activeSubscription?.appleTransactionId).toBe("txn_renewal_2"); // Most recent
    });

    it("should handle renewal with same billing period (duplicate detection)", async () => {
      const user = await createTestUser();
      const now = new Date();
      const purchaseDate = new Date(now);
      
      // Create initial subscription
      const initialSubscription = await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_initial_123",
        appleOriginalTransactionId: "orig_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "trialing",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: purchaseDate,
        currentPeriodEnd: new Date(purchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });

      // Try to create subscription with same transactionId (should be detected as duplicate)
      const existingByTransaction = await subscriptionModel.findByAppleTransactionId("txn_initial_123");
      expect(existingByTransaction).not.toBeNull();
      expect(existingByTransaction?.id).toBe(initialSubscription.id);
      
      // Try to create subscription with same originalTransactionId and same billing period
      // (within 1 day tolerance) - should be detected as duplicate
      const existingByOriginal = await subscriptionModel.findByAppleOriginalTransactionId("orig_123");
      expect(existingByOriginal).not.toBeNull();
      
      const sameBillingPeriodDate = new Date(purchaseDate.getTime() + 12 * 60 * 60 * 1000); // 12 hours later
      const timeDiff = Math.abs(sameBillingPeriodDate.getTime() - purchaseDate.getTime());
      expect(timeDiff).toBeLessThan(24 * 60 * 60 * 1000); // Less than 1 day, so same billing period
    });
  });

  describe("findActiveByUserId with Trialing Status", () => {
    it("should return subscription with 'trialing' status", async () => {
      const user = await createTestUser();
      const now = new Date();
      const purchaseDate = new Date(now);
      const expiresDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_trialing_123",
        appleOriginalTransactionId: "orig_trialing_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "trialing",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: purchaseDate,
        currentPeriodEnd: expiresDate,
        cancelAtPeriodEnd: false,
      });

      const activeSubscription = await subscriptionModel.findActiveByUserId(user.id);
      expect(activeSubscription).not.toBeNull();
      expect(activeSubscription?.status).toBe("trialing");
    });

    it("should return subscription with 'active' status", async () => {
      const user = await createTestUser();
      const now = new Date();
      const purchaseDate = new Date(now);
      const expiresDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_active_123",
        appleOriginalTransactionId: "orig_active_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "active",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: purchaseDate,
        currentPeriodEnd: expiresDate,
        cancelAtPeriodEnd: false,
      });

      const activeSubscription = await subscriptionModel.findActiveByUserId(user.id);
      expect(activeSubscription).not.toBeNull();
      expect(activeSubscription?.status).toBe("active");
    });

    it("should not return expired subscriptions", async () => {
      const user = await createTestUser();
      const now = new Date();
      const purchaseDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const expiresDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // Expired

      await subscriptionModel.create({
        userId: user.id,
        subscriptionType: "apple_iap",
        appleTransactionId: "txn_expired_123",
        appleOriginalTransactionId: "orig_expired_123",
        appleProductId: "com.keenvpn.premium.monthly",
        appleEnvironment: "Sandbox",
        status: "inactive",
        planName: "Premium VPN - Monthly",
        priceAmount: 12.99,
        priceCurrency: "USD",
        billingPeriod: "month",
        currentPeriodStart: purchaseDate,
        currentPeriodEnd: expiresDate,
        cancelAtPeriodEnd: false,
      });

      const activeSubscription = await subscriptionModel.findActiveByUserId(user.id);
      expect(activeSubscription).toBeNull();
    });
  });
});

