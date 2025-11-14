import express, { Request, Response, Router } from "express";
import SalesContact from "../models/SalesContact.js";
import {
  validateSalesContactRequest,
  sanitizeSalesContactRequest,
  getClientIP,
  getUserAgent,
} from "../utils/validation.js";
import {
  sendSalesTeamNotification,
  sendCustomerConfirmation,
} from "../utils/email.js";
import type {
  SalesContactRequest,
  SalesContactResponse,
  CreateSalesContactData,
  ApiResponse,
} from "../types/index.js";

const router: Router = express.Router();

/**
 * Submit Enterprise Sales Contact Request
 * POST /api/sales-contact/submit
 *
 * Accepts sales contact form data, validates it, checks for duplicates/spam,
 * stores in database, sends notifications to sales team and customer
 */
router.post("/submit", async (req: Request, res: Response): Promise<void> => {
  try {
    const requestData = req.body as SalesContactRequest;

    console.log("💳 Sales contact submission received from:", getClientIP(req));
    console.log("💳 Company:", requestData.companyName);
    console.log("💳 Email:", requestData.workEmail);
    console.log("💳 Team size:", requestData.teamSize);

    // 1. Validate input data
    const validation = validateSalesContactRequest(requestData);
    if (!validation.isValid) {
      console.log("❌ Validation failed:", validation.errors);
      res.status(400).json({
        success: false,
        error: "Validation failed",
        validationErrors: validation.errors,
      } as SalesContactResponse & { validationErrors: any[] });
      return;
    }

    // 2. Sanitize input data
    const sanitizedData = sanitizeSalesContactRequest(requestData);

    // 3. Check for recent duplicates (spam protection)
    const salesContactModel = new SalesContact();
    const clientIP = getClientIP(req);
    const duplicates = await salesContactModel.checkForDuplicates(
      sanitizedData.workEmail,
      clientIP,
      15 // 15 minutes window
    );

    if (duplicates.length > 0) {
      console.log("🚨 Duplicate submission detected:", {
        email: sanitizedData.workEmail,
        ip: clientIP,
        duplicateCount: duplicates.length,
      });

      // Allow 1 duplicate per IP per day (legitimate retries)
      // But block if more than 2 duplicates in 15 minutes
      const recentFromSameIP = duplicates.filter(
        (d) => d.ipAddress === clientIP
      );
      if (recentFromSameIP.length >= 2) {
        res.status(429).json({
          success: false,
          error:
            "Too many submissions. Please wait before submitting again or contact us directly if urgent.",
        } as SalesContactResponse);
        return;
      }

      // If duplicate from same email but different IP, just log and continue
      // (User might be submitting from different devices/networks)
      if (duplicates.length > 0 && recentFromSameIP.length === 0) {
        console.log(
          "⚠️ Duplicate email from different IP - allowing submission"
        );
      }
    }

    // 4. Prepare data for database storage
    const createData: CreateSalesContactData = {
      ...sanitizedData,
      ipAddress: clientIP,
      userAgent: getUserAgent(req),
    };

    // 5. Store in database
    console.log("💾 Storing sales contact in database...");
    const salesContact = await salesContactModel.create(createData);

    console.log(
      "✅ Sales contact created with reference ID:",
      salesContact.referenceId
    );

    // 6. Send notifications (don't block response on email failures)
    // Send both emails in parallel, but don't wait for them to complete
    const emailPromises = async (): Promise<void> => {
      try {
        // Send to sales team
        const salesNotificationSuccess = await sendSalesTeamNotification(
          createData,
          salesContact.referenceId
        );
        if (salesNotificationSuccess) {
          await salesContactModel.markSalesTeamNotified(salesContact.id);
        } else {
          console.error(
            "❌ Failed to send sales team notification for:",
            salesContact.referenceId
          );
        }
      } catch (error) {
        console.error("❌ Error in sales team notification:", error);
      }

      try {
        // Send to customer
        const customerConfirmationSuccess = await sendCustomerConfirmation(
          createData,
          salesContact.referenceId
        );
        if (customerConfirmationSuccess) {
          await salesContactModel.markCustomerConfirmationSent(salesContact.id);
        } else {
          console.error(
            "❌ Failed to send customer confirmation for:",
            salesContact.referenceId
          );
        }
      } catch (error) {
        console.error("❌ Error in customer confirmation:", error);
      }
    };

    // Execute email notifications without blocking the response
    emailPromises().catch((error) => {
      console.error("❌ Email notification errors:", error);
    });

    // 7. Return success response immediately
    console.log("✅ Sales contact submission completed successfully");
    res.status(200).json({
      success: true,
      referenceId: salesContact.referenceId,
      message:
        "Thank you for your interest! We've received your inquiry and will contact you within 24 hours.",
    } as SalesContactResponse);
  } catch (error) {
    console.error("❌ Sales contact submission error:", error);
    res.status(500).json({
      success: false,
      error:
        "Unable to process your request. Please try again or contact us directly.",
    } as SalesContactResponse);
  }
});

/**
 * Get Sales Contact by Reference ID (for customer lookup)
 * GET /api/sales-contact/:referenceId
 *
 * Allows customers to look up their submission status
 */
router.get(
  "/:referenceId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { referenceId } = req.params;

      if (!referenceId) {
        res.status(400).json({
          success: false,
          error: "Reference ID is required",
        } as ApiResponse);
        return;
      }

      console.log("🔍 Looking up sales contact by reference ID:", referenceId);

      const salesContactModel = new SalesContact();
      const salesContact = await salesContactModel.findByReferenceId(
        referenceId
      );

      if (!salesContact) {
        res.status(404).json({
          success: false,
          error: "Sales contact not found",
        } as ApiResponse);
        return;
      }

      // Return limited information (no sensitive data)
      res.status(200).json({
        success: true,
        data: {
          referenceId: salesContact.referenceId,
          companyName: salesContact.companyName,
          status: salesContact.status,
          submittedAt: salesContact.createdAt.toISOString(),
          salesTeamNotified: salesContact.salesTeamNotified,
          message: getStatusMessage(salesContact.status),
        },
      } as ApiResponse);
    } catch (error) {
      console.error("❌ Error looking up sales contact:", error);
      res.status(500).json({
        success: false,
        error: "Unable to look up your request",
      } as ApiResponse);
    }
  }
);

/**
 * Get status message for customer display
 */
function getStatusMessage(status: string): string {
  switch (status) {
    case "pending":
      return "Your request is being reviewed by our sales team. We'll contact you within 24 hours.";
    case "contacted":
      return "Our sales team has reached out to you. Please check your email or phone.";
    case "converted":
      return "Thank you for choosing KeenVPN! Your account setup is in progress.";
    case "spam":
      return "This request has been flagged for review.";
    default:
      return "Your request is being processed.";
  }
}

export default router;
