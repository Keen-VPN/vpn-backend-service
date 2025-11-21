import type { CreateSalesContactData, EmailConfig } from "../types/index.js";
import SalesContact from "../models/SalesContact.js";
import {
  loadEmailTemplate,
  prepareTemplateData,
} from "../templates/email/utils/template-engine.js";
import resend from "../config/resend.js";

// Default email configuration
const DEFAULT_CONFIG: EmailConfig = {
  salesTeamEmail: process.env.SALES_TEAM_EMAIL || "sales@vpnkeen.com",
  fromEmail: process.env.FROM_EMAIL || "noreply@vpnkeen.com",
  fromName: process.env.FROM_NAME || "KeenVPN Sales Contact System",
};

/**
 * Generate sales team notification email
 */
export function generateSalesTeamEmail(
  contactData: CreateSalesContactData,
  referenceId: string
): { subject: string; html: string; text: string } {
  const subject = `🚨 New Enterprise Sales Contact - ${contactData.companyName}`;

  // Prepare template data with all necessary information
  const templateData = prepareTemplateData(contactData, {
    referenceId,
    timestamp: new Date().toISOString(),
  });

  // Load and render templates
  const { html, text } = loadEmailTemplate("sales-team", templateData);

  return { subject, html, text };
}

/**
 * Generate customer confirmation email
 */
export function generateCustomerConfirmationEmail(
  contactData: CreateSalesContactData,
  referenceId: string
): { subject: string; html: string; text: string } {
  const subject =
    "Thank you for contacting KeenVPN Sales - We'll be in touch soon!";

  // Prepare template data with all necessary information
  const templateData = prepareTemplateData(contactData, {
    referenceId,
    preferredContactMethod: contactData.preferredContactMethod || "email",
    salesTeamEmail: DEFAULT_CONFIG.salesTeamEmail,
  });

  // Load and render templates
  const { html, text } = loadEmailTemplate("customer", templateData);

  return { subject, html, text };
}

/**
 * Send email using Resend API
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  config: EmailConfig = DEFAULT_CONFIG
): Promise<boolean> {
  try {
    console.log("📧 Sending email...");
    console.log("📧 To:", to);
    console.log("📧 From:", `${config.fromName} <${config.fromEmail}>`);
    console.log("📧 Subject:", subject);

    // In development, log the email content but still send via Resend
    if (process.env.NODE_ENV !== "production") {
      console.log("📧 [DEV MODE] Email content:");
      console.log("📧 HTML length:", html.length, "characters");
      console.log("📧 Text preview:", text.substring(0, 200) + "...");
    }

    // Send email via Resend
    const { data, error } = await resend.emails.send({
      from: `${config.fromName} <${config.fromEmail}>`,
      to: [to],
      subject,
      html,
      text,
    });

    if (error) {
      console.error("❌ Resend API error:", error);
      return false;
    }

    console.log("✅ Email sent successfully via Resend, ID:", data?.id);
    return true;
  } catch (error) {
    console.error("❌ Failed to send email:", error);
    return false;
  }
}

/**
 * Send sales team notification
 */
export async function sendSalesTeamNotification(
  contactData: CreateSalesContactData,
  referenceId: string,
  config: EmailConfig = DEFAULT_CONFIG
): Promise<boolean> {
  try {
    const { subject, html, text } = generateSalesTeamEmail(
      contactData,
      referenceId
    );

    console.log(
      "📧 Sending sales team notification for reference:",
      referenceId
    );
    const success = await sendEmail(
      config.salesTeamEmail,
      subject,
      html,
      text,
      config
    );

    if (success) {
      console.log("✅ Sales team notification sent successfully");
    } else {
      console.error("❌ Failed to send sales team notification");
    }

    return success;
  } catch (error) {
    console.error("❌ Error sending sales team notification:", error);
    return false;
  }
}

/**
 * Send customer confirmation email
 */
export async function sendCustomerConfirmation(
  contactData: CreateSalesContactData,
  referenceId: string,
  config: EmailConfig = DEFAULT_CONFIG
): Promise<boolean> {
  try {
    const { subject, html, text } = generateCustomerConfirmationEmail(
      contactData,
      referenceId
    );

    console.log("📧 Sending customer confirmation for reference:", referenceId);
    const success = await sendEmail(
      contactData.workEmail,
      subject,
      html,
      text,
      config
    );

    if (success) {
      console.log("✅ Customer confirmation sent successfully");
    } else {
      console.error("❌ Failed to send customer confirmation");
    }

    return success;
  } catch (error) {
    console.error("❌ Error sending customer confirmation:", error);
    return false;
  }
}

/**
 * Send both sales team notification and customer confirmation emails
 * This function runs asynchronously without blocking the API response
 */
export async function sendSalesContactEmails(
  contactData: CreateSalesContactData,
  salesContactId: string,
  referenceId: string,
  salesContactModel: SalesContact,
  config: EmailConfig = DEFAULT_CONFIG
): Promise<void> {
  // Send both emails in parallel
  const [salesNotificationResult, customerConfirmationResult] =
    await Promise.allSettled([
      sendSalesTeamNotification(contactData, referenceId, config),
      sendCustomerConfirmation(contactData, referenceId, config),
    ]);

  // Handle sales team notification result
  try {
    if (salesNotificationResult.status === "fulfilled") {
      if (salesNotificationResult.value) {
        await salesContactModel.markSalesTeamNotified(salesContactId);
      } else {
        console.error(
          "❌ Failed to send sales team notification for:",
          referenceId
        );
      }
    } else {
      console.error(
        "❌ Error in sales team notification:",
        salesNotificationResult.reason
      );
    }
  } catch (error) {
    console.error("❌ Error marking sales team as notified:", error);
  }

  // Handle customer confirmation result
  try {
    if (customerConfirmationResult.status === "fulfilled") {
      if (customerConfirmationResult.value) {
        await salesContactModel.markCustomerConfirmationSent(salesContactId);
      } else {
        console.error(
          "❌ Failed to send customer confirmation for:",
          referenceId
        );
      }
    } else {
      console.error(
        "❌ Error in customer confirmation:",
        customerConfirmationResult.reason
      );
    }
  } catch (error) {
    console.error("❌ Error marking customer confirmation as sent:", error);
  }
}
