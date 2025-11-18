import type { CreateSalesContactData, EmailConfig } from "../types/index.js";
import SalesContact from "../models/SalesContact.js";

/**
 * Email utility for sales contact notifications
 * In production, this should be replaced with a proper email service like SendGrid, AWS SES, etc.
 */

// Default email configuration
const DEFAULT_CONFIG: EmailConfig = {
  salesTeamEmail: process.env.SALES_TEAM_EMAIL || "sales@keenvpn.com",
  fromEmail: process.env.FROM_EMAIL || "noreply@keenvpn.com",
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

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">New Enterprise Sales Contact</h2>
      
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #64748b;"><strong>Reference ID:</strong> ${referenceId}</p>
      </div>

      <h3 style="color: #374151;">Company Information</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Company:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${
            contactData.companyName
          }</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Work Email:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
            <a href="mailto:${contactData.workEmail}" style="color: #2563eb;">${
    contactData.workEmail
  }</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Team Size:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${
            contactData.teamSize
          } users</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Country/Region:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${
            contactData.countryRegion
          }</td>
        </tr>
        ${
          contactData.phone
            ? `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Phone:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${contactData.phone}</td>
        </tr>
        `
            : ""
        }
        ${
          contactData.preferredContactMethod
            ? `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Preferred Contact:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${contactData.preferredContactMethod}</td>
        </tr>
        `
            : ""
        }
        ${
          contactData.preferredContactTime
            ? `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Preferred Time:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${contactData.preferredContactTime}</td>
        </tr>
        `
            : ""
        }
      </table>

      ${
        contactData.useCase
          ? `
      <h3 style="color: #374151;">Use Case</h3>
      <div style="background: #f8fafc; padding: 15px; border-radius: 6px; border-left: 4px solid #2563eb;">
        ${contactData.useCase}
      </div>
      `
          : ""
      }

      ${
        contactData.message
          ? `
      <h3 style="color: #374151;">Additional Message</h3>
      <div style="background: #f8fafc; padding: 15px; border-radius: 6px; border-left: 4px solid #2563eb;">
        ${contactData.message}
      </div>
      `
          : ""
      }

      <div style="margin-top: 30px; padding: 20px; background: #fef3c7; border-radius: 8px;">
        <h4 style="color: #92400e; margin: 0 0 10px 0;">⏱️ Follow-up Reminder</h4>
        <p style="margin: 0; color: #92400e;">
          Please respond to this enterprise inquiry within 24 hours. High-value prospects expect prompt responses.
        </p>
      </div>

      <div style="margin-top: 20px; font-size: 12px; color: #6b7280;">
        <p>Contact submitted: ${new Date().toISOString()}</p>
        ${
          contactData.ipAddress
            ? `<p>IP Address: ${contactData.ipAddress}</p>`
            : ""
        }
      </div>
    </div>
  `;

  const text = `
    NEW ENTERPRISE SALES CONTACT
    
    Reference ID: ${referenceId}
    
    Company Information:
    - Company: ${contactData.companyName}
    - Work Email: ${contactData.workEmail}
    - Team Size: ${contactData.teamSize} users
    - Country/Region: ${contactData.countryRegion}
    ${contactData.phone ? `- Phone: ${contactData.phone}` : ""}
    ${
      contactData.preferredContactMethod
        ? `- Preferred Contact: ${contactData.preferredContactMethod}`
        : ""
    }
    ${
      contactData.preferredContactTime
        ? `- Preferred Time: ${contactData.preferredContactTime}`
        : ""
    }
    
    ${contactData.useCase ? `Use Case:\n${contactData.useCase}\n` : ""}
    ${
      contactData.message ? `Additional Message:\n${contactData.message}\n` : ""
    }
    
    ⏱️ Follow-up Reminder: Please respond within 24 hours.
    
    Contact submitted: ${new Date().toISOString()}
    ${contactData.ipAddress ? `IP Address: ${contactData.ipAddress}` : ""}
  `;

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

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #2563eb, #3b82f6); color: white; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">Thank You for Your Interest!</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">We've received your enterprise inquiry</p>
      </div>
      
      <div style="padding: 30px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Hello from the KeenVPN team! We've successfully received your enterprise sales inquiry and are excited to learn more about ${
            contactData.companyName
          }.
        </p>

        <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <h3 style="margin: 0 0 10px 0; color: #1e40af;">Your Reference ID</h3>
          <p style="margin: 0; font-family: monospace; font-size: 18px; font-weight: bold; color: #1e40af;">${referenceId}</p>
          <p style="margin: 10px 0 0 0; font-size: 14px; color: #64748b;">Save this reference ID for future correspondence</p>
        </div>

        <h3 style="color: #374151; margin: 25px 0 15px 0;">What happens next?</h3>
        <ul style="color: #64748b; line-height: 1.6;">
          <li>Our sales team will review your request within <strong>24 hours</strong></li>
          <li>We'll reach out via ${
            contactData.preferredContactMethod || "email"
          } to schedule a consultation</li>
          <li>We'll discuss your specific VPN needs for ${
            contactData.teamSize
          } users</li>
          <li>We'll provide a customized quote and implementation plan</li>
        </ul>

        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <h4 style="margin: 0 0 10px 0; color: #374151;">Your Submission Summary</h4>
          <table style="width: 100%; font-size: 14px;">
            <tr>
              <td style="padding: 5px 10px 5px 0; color: #6b7280;">Company:</td>
              <td style="padding: 5px 0; color: #374151; font-weight: 500;">${
                contactData.companyName
              }</td>
            </tr>
            <tr>
              <td style="padding: 5px 10px 5px 0; color: #6b7280;">Team Size:</td>
              <td style="padding: 5px 0; color: #374151; font-weight: 500;">${
                contactData.teamSize
              } users</td>
            </tr>
            <tr>
              <td style="padding: 5px 10px 5px 0; color: #6b7280;">Region:</td>
              <td style="padding: 5px 0; color: #374151; font-weight: 500;">${
                contactData.countryRegion
              }</td>
            </tr>
          </table>
        </div>

        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <h4 style="margin: 0 0 10px 0; color: #92400e;">🚨 Urgent Need?</h4>
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            If your VPN needs are urgent, please reply to this email with "URGENT" in the subject line, and we'll prioritize your request.
          </p>
        </div>

        <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
          Best regards,<br>
          <strong>The KeenVPN Sales Team</strong><br>
          <a href="mailto:${
            DEFAULT_CONFIG.salesTeamEmail
          }" style="color: #2563eb;">${DEFAULT_CONFIG.salesTeamEmail}</a>
        </p>
      </div>
    </div>
  `;

  const text = `
    Thank You for Your Interest in KeenVPN Enterprise!
    
    Hello from the KeenVPN team! We've successfully received your enterprise sales inquiry and are excited to learn more about ${
      contactData.companyName
    }.
    
    Your Reference ID: ${referenceId}
    (Save this reference ID for future correspondence)
    
    What happens next?
    • Our sales team will review your request within 24 hours
    • We'll reach out via ${
      contactData.preferredContactMethod || "email"
    } to schedule a consultation
    • We'll discuss your specific VPN needs for ${contactData.teamSize} users
    • We'll provide a customized quote and implementation plan
    
    Your Submission Summary:
    - Company: ${contactData.companyName}
    - Team Size: ${contactData.teamSize} users
    - Region: ${contactData.countryRegion}
    
    🚨 Urgent Need?
    If your VPN needs are urgent, please reply to this email with "URGENT" in the subject line, and we'll prioritize your request.
    
    Best regards,
    The KeenVPN Sales Team
    ${DEFAULT_CONFIG.salesTeamEmail}
  `;

  return { subject, html, text };
}

/**
 * Send email using console logging (for development)
 * In production, replace this with actual email service integration
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

    // In development, just log the email content
    if (process.env.NODE_ENV !== "production") {
      console.log("📧 [DEV MODE] Email content:");
      console.log("📧 HTML length:", html.length, "characters");
      console.log("📧 Text content:", text);
      console.log("✅ Email logged successfully (development mode)");
      return true;
    }

    // TODO: In production, integrate with actual email service
    // Examples:
    // - SendGrid: await sgMail.send({ to, from: config.fromEmail, subject, html, text })
    // - AWS SES: await ses.sendEmail({ ... })
    // - Nodemailer: await transporter.sendMail({ ... })

    console.log("⚠️ Email sending not configured for production yet");
    console.log("📧 Email details logged for manual processing");

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
  try {
    // Send to sales team
    const salesNotificationSuccess = await sendSalesTeamNotification(
      contactData,
      referenceId,
      config
    );
    if (salesNotificationSuccess) {
      await salesContactModel.markSalesTeamNotified(salesContactId);
    } else {
      console.error(
        "❌ Failed to send sales team notification for:",
        referenceId
      );
    }
  } catch (error) {
    console.error("❌ Error in sales team notification:", error);
  }

  try {
    // Send to customer
    const customerConfirmationSuccess = await sendCustomerConfirmation(
      contactData,
      referenceId,
      config
    );
    if (customerConfirmationSuccess) {
      await salesContactModel.markCustomerConfirmationSent(salesContactId);
    } else {
      console.error(
        "❌ Failed to send customer confirmation for:",
        referenceId
      );
    }
  } catch (error) {
    console.error("❌ Error in customer confirmation:", error);
  }
}
