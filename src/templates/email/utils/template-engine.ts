/**
 * Simple template engine for email templates
 * Supports variable substitution using {{variable}} syntax
 */

import { readFileSync } from "fs";
import { join } from "path";

export interface TemplateData {
  [key: string]: any;
}

/**
 * Get value from data object using dot notation
 */
function getValue(data: TemplateData, path: string): any {
  if (path.includes(".")) {
    const keys = path.split(".");
    let value: any = data;

    for (const k of keys) {
      value = value?.[k];
      if (value === undefined || value === null) {
        return null;
      }
    }

    return value;
  }

  return data[path];
}

/**
 * Check if a value is "truthy" for template conditions
 */
function isTruthy(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return value !== 0;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return !!value;
}

/**
 * Process conditional blocks in template
 */
function processConditionals(template: string, data: TemplateData): string {
  // Process {{#if condition}}...{{/if}} blocks
  template = template.replace(
    /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, condition, content) => {
      const value = getValue(data, condition.trim());
      return isTruthy(value) ? content : "";
    }
  );

  // Process {{#unless condition}}...{{/unless}} blocks
  template = template.replace(
    /\{\{#unless\s+([^}]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    (_, condition, content) => {
      const value = getValue(data, condition.trim());
      return !isTruthy(value) ? content : "";
    }
  );

  return template;
}

/**
 * Replace template variables with actual values
 * Supports nested object properties using dot notation and conditional blocks
 */
export function renderTemplate(template: string, data: TemplateData): string {
  // First process conditional blocks
  template = processConditionals(template, data);

  // Then replace variables
  return template.replace(/\{\{([^}#/]+)\}\}/g, (_, key) => {
    const trimmedKey = key.trim();
    const value = getValue(data, trimmedKey);

    if (value === null || value === undefined) {
      return "";
    }

    return String(value);
  });
}

/**
 * Load and render an email template file
 */
export function loadTemplate(templatePath: string, data: TemplateData): string {
  try {
    // Always read from source templates directory for reliability
    // This works in both development and production
    const srcPath = join(
      process.cwd(),
      "src",
      "templates",
      "email",
      templatePath
    );
    const templateContent = readFileSync(srcPath, "utf-8");
    return renderTemplate(templateContent, data);
  } catch (error) {
    console.error(`❌ Failed to load template: ${templatePath}`, error);
    throw new Error(`Template not found: ${templatePath}`);
  }
}

/**
 * Load email templates (HTML and text) and render them with data
 */
export function loadEmailTemplate(
  templateName: string,
  data: TemplateData
): { html: string; text: string } {
  const htmlPath = `${templateName}/${templateName}.html`;
  const textPath = `${templateName}/${templateName}.txt`;

  const html = loadTemplate(htmlPath, data);
  const text = loadTemplate(textPath, data);

  return { html, text };
}

/**
 * Helper function to create template-friendly data structure
 */
export function prepareTemplateData(
  contactData: any,
  additionalData: any = {}
): TemplateData {
  return {
    contactData,
    ...additionalData,
    // Add some computed helpers
    hasPhone: !!(contactData.phone && contactData.phone.trim()),
    hasCountryRegion: !!(
      contactData.countryRegion && contactData.countryRegion.trim()
    ),
    hasUseCase: !!(contactData.useCase && contactData.useCase.trim()),
    hasMessage: !!(contactData.message && contactData.message.trim()),
    hasPreferredContactMethod: !!(
      contactData.preferredContactMethod &&
      contactData.preferredContactMethod.trim()
    ),
    hasPreferredContactTime: !!(
      contactData.preferredContactTime &&
      contactData.preferredContactTime.trim()
    ),
  };
}
