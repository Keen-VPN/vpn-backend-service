import type {
  SalesContactRequest,
  ValidationResult,
  ValidationError,
} from "../types/index.js";

/**
 * List of common disposable email domains to block
 * In production, consider using a more comprehensive service or API
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.org",
  "yopmail.com",
  "temp-mail.org",
  "throwaway.email",
  "getnada.com",
  "maildrop.cc",
  "sharklasers.com",
  "grr.la",
  "guerrillamailblock.com",
]);

/**
 * List of common personal email domains (should encourage work emails)
 */
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "live.com",
]);

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if email domain is disposable
 */
function isDisposableEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1];
  return domain ? DISPOSABLE_EMAIL_DOMAINS.has(domain) : false;
}

/**
 * Check if email is from a personal domain (warn but don't block)
 */
function isPersonalEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1];
  return domain ? PERSONAL_EMAIL_DOMAINS.has(domain) : false;
}

/**
 * Validate company name
 */
function validateCompanyName(companyName: string): ValidationError | null {
  if (!companyName || companyName.trim().length === 0) {
    return { field: "companyName", message: "Company name is required" };
  }

  if (companyName.trim().length < 2) {
    return {
      field: "companyName",
      message: "Company name must be at least 2 characters long",
    };
  }

  if (companyName.trim().length > 100) {
    return {
      field: "companyName",
      message: "Company name must be less than 100 characters",
    };
  }

  return null;
}

/**
 * Validate work email
 */
function validateWorkEmail(workEmail: string): ValidationError | null {
  if (!workEmail || workEmail.trim().length === 0) {
    return { field: "workEmail", message: "Work email is required" };
  }

  const trimmedEmail = workEmail.trim();

  if (!isValidEmail(trimmedEmail)) {
    return {
      field: "workEmail",
      message: "Please enter a valid email address",
    };
  }

  if (isDisposableEmail(trimmedEmail)) {
    return {
      field: "workEmail",
      message:
        "Disposable email addresses are not allowed. Please use your work email.",
    };
  }

  if (isPersonalEmail(trimmedEmail)) {
    return {
      field: "workEmail",
      message:
        "Please use your work email address instead of a personal email for enterprise inquiries",
    };
  }

  return null;
}

/**
 * Validate team size
 */
function validateTeamSize(teamSize: number | string): ValidationError | null {
  const size = typeof teamSize === "string" ? parseInt(teamSize, 10) : teamSize;

  if (isNaN(size)) {
    return { field: "teamSize", message: "Team size must be a valid number" };
  }

  if (size < 1) {
    return { field: "teamSize", message: "Team size must be at least 1 user" };
  }

  if (size > 100000) {
    return {
      field: "teamSize",
      message: "Team size must be less than 100,000 users",
    };
  }

  // Small teams are allowed - enterprise plans can accommodate any team size
  // (Original validation was too restrictive - removed blocking for small teams)

  return null;
}

/**
 * Validate consent
 */
function validateConsent(hasConsent: boolean): ValidationError | null {
  if (hasConsent !== true) {
    return {
      field: "hasConsent",
      message: "You must consent to us contacting you about your inquiry",
    };
  }

  return null;
}

/**
 * Validate optional phone number
 */
function validatePhone(phone?: string): ValidationError | null {
  if (!phone || phone.trim().length === 0) {
    return null; // Optional field
  }

  const trimmedPhone = phone.trim();

  // Basic phone validation - allow international formats
  const phoneRegex = /^[\+]?[\d\s\-\(\)\.]{7,20}$/;
  if (!phoneRegex.test(trimmedPhone)) {
    return { field: "phone", message: "Please enter a valid phone number" };
  }

  return null;
}

/**
 * Validate optional text fields (use case, message, etc.)
 */
function validateOptionalText(
  value: string | undefined,
  fieldName: string,
  maxLength: number
): ValidationError | null {
  if (!value || value.trim().length === 0) {
    return null; // Optional field
  }

  if (value.trim().length > maxLength) {
    return {
      field: fieldName,
      message: `${fieldName} must be less than ${maxLength} characters`,
    };
  }

  return null;
}

/**
 * Basic spam detection patterns
 */
function detectSpamPatterns(data: SalesContactRequest): ValidationError[] {
  const spamErrors: ValidationError[] = [];

  // Check for suspicious patterns in company name
  const suspiciousCompanyPatterns = [
    /test/i,
    /sample/i,
    /example/i,
    /fake/i,
    /spam/i,
    /^[a-z]{1,3}$/i, // Very short random letters
    /^\d+$/, // Only numbers
  ];

  suspiciousCompanyPatterns.forEach((pattern) => {
    if (pattern.test(data.companyName)) {
      spamErrors.push({
        field: "companyName",
        message: "Please enter your actual company name",
      });
    }
  });

  // Check for suspicious email patterns
  if (data.workEmail.includes("+test") || data.workEmail.includes("+spam")) {
    spamErrors.push({
      field: "workEmail",
      message: "Please use your primary work email address",
    });
  }

  // Check for repeated characters in message/use case
  const textFields = [data.message, data.useCase].filter(Boolean);
  textFields.forEach((text) => {
    if (text && /(.)\1{10,}/.test(text)) {
      // 10+ repeated characters
      spamErrors.push({
        field: "message",
        message: "Please provide a meaningful message",
      });
    }
  });

  return spamErrors;
}

/**
 * Main validation function for sales contact request
 */
export function validateSalesContactRequest(
  data: SalesContactRequest
): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate required fields
  const companyError = validateCompanyName(data.companyName);
  if (companyError) errors.push(companyError);

  const emailError = validateWorkEmail(data.workEmail);
  if (emailError) errors.push(emailError);

  const teamSizeError = validateTeamSize(data.teamSize);
  if (teamSizeError) errors.push(teamSizeError);

  // const countryError = validateCountryRegion(data.countryRegion);
  // if (countryError) errors.push(countryError);

  const consentError = validateConsent(data.hasConsent);
  if (consentError) errors.push(consentError);

  // Validate optional fields
  const phoneError = validatePhone(data.phone);
  if (phoneError) errors.push(phoneError);

  const useCaseError = validateOptionalText(data.useCase, "useCase", 1000);
  if (useCaseError) errors.push(useCaseError);

  const messageError = validateOptionalText(data.message, "message", 2000);
  if (messageError) errors.push(messageError);

  const contactMethodError = validateOptionalText(
    data.preferredContactMethod,
    "preferredContactMethod",
    100
  );
  if (contactMethodError) errors.push(contactMethodError);

  const contactTimeError = validateOptionalText(
    data.preferredContactTime,
    "preferredContactTime",
    100
  );
  if (contactTimeError) errors.push(contactTimeError);

  // Spam detection (only if basic validation passes)
  if (errors.length === 0) {
    const spamErrors = detectSpamPatterns(data);
    errors.push(...spamErrors);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitize input data by trimming whitespace and removing potentially harmful content
 */
export function sanitizeSalesContactRequest(
  data: SalesContactRequest
): SalesContactRequest {
  return {
    companyName: data.companyName.trim(),
    workEmail: data.workEmail.trim().toLowerCase(),
    teamSize:
      typeof data.teamSize === "string"
        ? parseInt(data.teamSize, 10)
        : data.teamSize,
    countryRegion: data.countryRegion?.trim() || undefined,
    hasConsent: data.hasConsent,
    phone: data.phone?.trim() || undefined,
    useCase: data.useCase?.trim() || undefined,
    preferredContactMethod: data.preferredContactMethod?.trim() || undefined,
    preferredContactTime: data.preferredContactTime?.trim() || undefined,
    message: data.message?.trim() || undefined,
  };
}

/**
 * Get user agent from request
 */
export function getUserAgent(req: any): string | undefined {
  return req.headers["user-agent"] || undefined;
}
