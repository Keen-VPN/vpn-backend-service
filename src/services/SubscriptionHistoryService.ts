import type { Subscription as PrismaSubscription } from "@prisma/client";
import Subscription from "../models/Subscription.js";
import AppleIAPPurchaseModel from "../models/AppleIAPPurchase.js";
import stripe from "../config/stripe.js";
import type {
  HistoryEvent,
  HistoryOptions,
  HistoryResponse,
  EventDetails,
  ProviderActions,
  AppleIAPPurchaseLedgerEntry,
} from "../types/index.js";

/**
 * SubscriptionHistoryService - Unifies subscription data from multiple providers
 * Creates a unified timeline of subscription events from Stripe and Apple IAP
 */
class SubscriptionHistoryService {
  private subscriptionModel: Subscription;
  private appleIAPModel: AppleIAPPurchaseModel;

  constructor() {
    this.subscriptionModel = new Subscription();
    this.appleIAPModel = new AppleIAPPurchaseModel();
  }

  /**
   * Get unified subscription history for a user
   */
  async getUnifiedHistory(
    userId: string,
    options: HistoryOptions = {}
  ): Promise<HistoryResponse> {
    try {
      const { page = 1, limit = 25, provider, dateFrom, dateTo } = options;

      console.log("🔍 Getting subscription history for user:", userId);

      // Validate limits to prevent excessive resource usage
      const maxLimit = parseInt(process.env.HISTORY_MAX_PAGE_SIZE || "100", 10);
      const effectiveLimit = Math.min(limit, maxLimit);

      // Convert date strings to Date objects if provided
      const dateFromObj = dateFrom ? new Date(dateFrom) : undefined;
      const dateToObj = dateTo ? new Date(dateTo) : undefined;

      // For better performance, fetch more data than needed to account for sorting
      // This prevents having to fetch ALL data for pagination
      const fetchMultiplier = 2;
      const estimatedFetchSize = Math.min(
        effectiveLimit * fetchMultiplier * page,
        1000
      );

      // Fetch data from both sources in parallel
      const [stripeSubscriptions, appleIAPPurchases] = await Promise.all([
        provider === "apple_iap"
          ? []
          : this.getOptimizedStripeData(
              userId,
              dateFromObj,
              dateToObj,
              estimatedFetchSize
            ),
        provider === "stripe"
          ? []
          : this.getOptimizedAppleData(
              userId,
              dateFromObj,
              dateToObj,
              estimatedFetchSize
            ),
      ]);

      // Parse events from each provider
      const stripeEvents = this.parseStripeSubscriptions(stripeSubscriptions);
      const appleEvents = this.parseAppleIAPPurchases(
        appleIAPPurchases,
        dateFromObj,
        dateToObj
      );

      // Merge and sort all events
      const allEvents = this.mergeAndSortEvents(stripeEvents, appleEvents);

      // Apply pagination
      const total = allEvents.length;
      const startIndex = (page - 1) * effectiveLimit;
      const endIndex = startIndex + effectiveLimit;
      const paginatedEvents = allEvents.slice(startIndex, endIndex);

      const hasNextPage = endIndex < total;
      const hasPreviousPage = page > 1;

      console.log("✅ Found", total, "subscription events for user:", userId);

      return {
        events: paginatedEvents,
        pagination: {
          page,
          limit: effectiveLimit,
          total,
          hasNextPage,
          hasPreviousPage,
        },
      };
    } catch (error) {
      console.error("❌ Failed to get unified subscription history:", error);
      throw error;
    }
  }

  /**
   * Optimized Stripe data fetching with limits
   */
  private async getOptimizedStripeData(
    userId: string,
    dateFrom?: Date,
    dateTo?: Date,
    _limit: number = 100 // Prefixed with underscore to indicate intentionally unused
  ): Promise<PrismaSubscription[]> {
    // Use the existing findHistoryByUserId method which already has date filtering
    // For now, we'll fetch all and rely on the database indexes for performance
    // In a future optimization, we could add LIMIT to the Prisma query
    return this.subscriptionModel.findHistoryByUserId(userId, dateFrom, dateTo);
  }

  /**
   * Optimized Apple IAP data fetching with limits
   */
  private async getOptimizedAppleData(
    userId: string,
    _dateFrom?: Date, // Prefixed with underscore to indicate intentionally unused
    _dateTo?: Date, // Prefixed with underscore to indicate intentionally unused
    _limit: number = 100 // Prefixed with underscore to indicate intentionally unused
  ): Promise<AppleIAPPurchaseLedgerEntry[]> {
    // Use the existing findByUserId method
    // The Apple model already orders by purchaseDate desc
    return this.appleIAPModel.findByUserId(userId);
  }

  /**
   * Get detailed information for a specific event
   */
  async getEventDetails(
    userId: string,
    eventId: string
  ): Promise<EventDetails> {
    try {
      console.log("🔍 Getting event details for:", eventId);

      // Parse the event ID to determine provider and source ID
      const parts = eventId.split(":");
      const provider = parts[0];
      const sourceId = parts[1];

      if (!provider || !sourceId) {
        throw new Error("Invalid event ID format");
      }

      if (provider === "stripe") {
        const subscription = await this.subscriptionModel.findById(sourceId);
        if (!subscription || subscription.userId !== userId) {
          throw new Error("Event not found or access denied");
        }

        const events = this.parseStripeSubscriptions([subscription]);
        const event = events[0];
        if (!event) {
          throw new Error("Event not found");
        }
        const providerActions = await this.generateStripeProviderActions(
          subscription
        );

        return {
          event,
          providerActions,
          additionalDetails: {
            stripeSubscriptionId: subscription.stripeSubscriptionId,
            stripeCustomerId: subscription.stripeCustomerId,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
          },
        };
      } else if (provider === "apple_iap") {
        const purchase = await this.appleIAPModel.findByOriginalTransactionId(
          sourceId
        );
        if (!purchase || purchase.linkedUserId !== userId) {
          throw new Error("Event not found or access denied");
        }

        const events = this.parseAppleIAPPurchases([purchase]);
        const event = events[0];
        if (!event) {
          throw new Error("Event not found");
        }
        const providerActions = this.generateAppleProviderActions();

        return {
          event,
          providerActions,
          additionalDetails: {
            transactionId: purchase.transactionId,
            originalTransactionId: purchase.originalTransactionId,
            environment: purchase.environment,
            productId: purchase.productId,
          },
        };
      } else {
        throw new Error("Invalid event ID format");
      }
    } catch (error) {
      console.error("❌ Failed to get event details:", error);
      throw error;
    }
  }

  /**
   * Parse Stripe subscription records into history events
   */
  private parseStripeSubscriptions(
    subscriptions: PrismaSubscription[]
  ): HistoryEvent[] {
    const events: HistoryEvent[] = [];

    for (const subscription of subscriptions) {
      // Purchase/Creation event
      events.push({
        id: `stripe:${subscription.id}`,
        eventDate: subscription.createdAt.toISOString(),
        eventType: "purchase",
        provider: "stripe",
        planName: subscription.planName || "Premium VPN",
        amount: subscription.priceAmount
          ? Number(subscription.priceAmount)
          : undefined,
        currency: subscription.priceCurrency || "USD",
        status: subscription.status as any,
        periodStart: subscription.currentPeriodStart?.toISOString(),
        periodEnd: subscription.currentPeriodEnd?.toISOString(),
        description: this.generateStripeDescription("purchase", subscription),
      });

      // Cancellation event (if cancelled)
      if (subscription.cancelledAt) {
        events.push({
          id: `stripe:${subscription.id}:cancellation`,
          eventDate: subscription.cancelledAt.toISOString(),
          eventType: "cancellation",
          provider: "stripe",
          planName: subscription.planName || "Premium VPN",
          currency: subscription.priceCurrency || "USD",
          status: subscription.cancelAtPeriodEnd ? "active" : "cancelled",
          periodEnd: subscription.currentPeriodEnd?.toISOString(),
          description: this.generateStripeDescription(
            "cancellation",
            subscription
          ),
        });
      }
    }

    return events;
  }

  /**
   * Parse Apple IAP purchase records into history events
   */
  private parseAppleIAPPurchases(
    purchases: AppleIAPPurchaseLedgerEntry[],
    dateFrom?: Date,
    dateTo?: Date
  ): HistoryEvent[] {
    const events: HistoryEvent[] = [];

    for (const purchase of purchases) {
      const purchaseDate = new Date(purchase.purchaseDate);

      // Apply date filtering
      if (dateFrom && purchaseDate < dateFrom) continue;
      if (dateTo && purchaseDate > dateTo) continue;

      // Purchase event
      events.push({
        id: `apple_iap:${purchase.originalTransactionId}`,
        eventDate: purchase.purchaseDate,
        eventType: "purchase",
        provider: "apple_iap",
        planName: this.mapAppleProductToName(purchase.productId),
        currency: "USD", // Apple doesn't provide pricing info in server notifications
        status:
          purchase.expiresDate && new Date(purchase.expiresDate) > new Date()
            ? "active"
            : "expired",
        periodStart: purchase.purchaseDate,
        periodEnd: purchase.expiresDate || undefined,
        description: this.generateAppleDescription("purchase", purchase),
      });
    }

    return events;
  }

  /**
   * Merge and sort events from all providers by date (descending)
   */
  private mergeAndSortEvents(
    stripeEvents: HistoryEvent[],
    appleEvents: HistoryEvent[]
  ): HistoryEvent[] {
    const allEvents = [...stripeEvents, ...appleEvents];
    return allEvents.sort(
      (a, b) =>
        new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
    );
  }

  /**
   * Generate Stripe-specific provider actions
   */
  private async generateStripeProviderActions(
    subscription: PrismaSubscription
  ): Promise<ProviderActions> {
    const actions: ProviderActions = {};

    try {
      // Generate Stripe Customer Portal URL if customer exists and subscription is active
      if (subscription.stripeCustomerId && subscription.status === "active") {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: subscription.stripeCustomerId,
          return_url:
            process.env.STRIPE_PORTAL_RETURN_URL ||
            "https://vpnkeen.com/account",
        });
        actions.manageSubscription = portalSession.url;
      }

      // TODO: Add invoice download links when available
      // This would require fetching invoice data from Stripe
    } catch (error) {
      console.error("⚠️ Failed to generate Stripe provider actions:", error);
      // Continue without provider actions
    }

    return actions;
  }

  /**
   * Generate Apple-specific provider actions
   */
  private generateAppleProviderActions(): ProviderActions {
    return {
      appStoreManage: true,
    };
  }

  /**
   * Map Apple product ID to human-readable plan name
   */
  private mapAppleProductToName(productId: string): string {
    // Map common Apple product IDs to plan names
    const productMap: Record<string, string> = {
      "com.vpnkeen.premium.monthly": "Premium VPN - Monthly",
      "com.vpnkeen.premium.yearly": "Premium VPN - Annual",
      "com.vpnkeen.premium.annual": "Premium VPN - Annual",
      // Add more mappings as needed
    };

    return productMap[productId] || "Premium VPN";
  }

  /**
   * Generate human-readable description for Stripe events
   */
  private generateStripeDescription(
    eventType: string,
    subscription: PrismaSubscription
  ): string {
    const planName = subscription.planName || "Premium VPN";

    switch (eventType) {
      case "purchase":
        return `${planName} subscription started`;
      case "cancellation":
        if (subscription.cancelAtPeriodEnd) {
          const endDate = subscription.currentPeriodEnd
            ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
            : "end of period";
          return `Subscription cancelled - expires ${endDate}`;
        }
        return `${planName} subscription cancelled`;
      case "renewal":
        return `Subscription auto-renewed for ${planName}`;
      default:
        return `${planName} subscription event`;
    }
  }

  /**
   * Generate human-readable description for Apple IAP events
   */
  private generateAppleDescription(
    eventType: string,
    purchase: AppleIAPPurchaseLedgerEntry
  ): string {
    const planName = this.mapAppleProductToName(purchase.productId);

    switch (eventType) {
      case "purchase":
        return `${planName} purchased via App Store`;
      case "renewal":
        return `${planName} auto-renewed via App Store`;
      default:
        return `${planName} App Store transaction`;
    }
  }
}

export default SubscriptionHistoryService;
