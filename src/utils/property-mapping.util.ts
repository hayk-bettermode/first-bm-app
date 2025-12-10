/**
 * Utility functions for mapping HubSpot property types to Bettermode field types
 */

/**
 * Map HubSpot property type to Bettermode field type
 */
export function mapHubSpotTypeToBettermode(hubspotType: string): string {
  const typeMapping: Record<string, string> = {
    string: "text",
    number: "number",
    date: "date",
    datetime: "datetime",
    enumeration: "text", // Enumeration becomes text in Bettermode
    bool: "text", // Boolean becomes text (true/false)
    phone_number: "text",
    url: "text",
  };

  return typeMapping[hubspotType.toLowerCase()] || "text";
}

/**
 * Transform HubSpot property value to Bettermode format
 */
export function transformPropertyValue(
  value: string | undefined,
  hubspotType: string,
): string | number | Date | null {
  if (!value) return null;

  const normalizedType = hubspotType.toLowerCase();

  switch (normalizedType) {
    case "number":
      const numValue = parseFloat(value);
      return isNaN(numValue) ? null : numValue;

    case "date":
    case "datetime":
      const dateValue = new Date(value);
      return isNaN(dateValue.getTime()) ? null : dateValue;

    case "bool":
      return value.toLowerCase() === "true" ? "true" : "false";

    default:
      return value;
  }
}

/**
 * Generate Bettermode field key from HubSpot property name
 * Converts property name to snake_case and ensures it's valid
 */
export function generateFieldKey(hubspotPropertyName: string): string {
  // Convert camelCase or kebab-case to snake_case
  return hubspotPropertyName
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "") // Remove leading underscore
    .replace(/[^a-z0-9_]/g, "_") // Replace invalid chars with underscore
    .replace(/_+/g, "_") // Replace multiple underscores with single
    .replace(/^_|_$/g, ""); // Remove leading/trailing underscores
}

/**
 * Generate human-readable field name from HubSpot property label
 */
export function generateFieldName(hubspotLabel: string): string {
  return hubspotLabel || "Unknown Field";
}
