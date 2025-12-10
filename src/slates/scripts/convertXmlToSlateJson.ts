/**
 * Bettermode Slate XML to JSON converter
 * Usage: convertXmlToSlateJson(xmlContent: string, variables?: Record<string, any>): SlateJson
 */

import { XMLParser } from "fast-xml-parser";
import { template as _template } from "lodash";

export interface Block {
  id: string;
  name: string;
  props: string;    // JSON stringified props object
  children: string; // JSON stringified array of child block IDs
}

export interface SlateJson {
  rootBlock: string; // ID of the root block
  blocks: Block[];   // Flat array of all blocks (outer-to-inner order)
}

// Convert string values to proper types (booleans, numbers)
const parseValue = (v: any) =>
  v === "true" ? true : v === "false" ? false :
  typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;

export function convertXmlToSlateJson(xmlContent: string, variables?: Record<string, any>): SlateJson {
  const blocks: Block[] = [];

  // Recursively process an XML element into a Block
  const processNode = (tagName: string, node: any): string | null => {
    // Skip XML declarations and text nodes
    if (tagName.startsWith("?") || typeof node === "string") return null;

    const entries = Object.entries(node ?? {});
    // Separate attributes (primitives) from child elements (objects)
    const attrs = Object.fromEntries(entries.filter(([, v]) => typeof v !== "object"));
    const children = entries.filter(([, v]) => typeof v === "object" && v !== null);

    // id is required per XSD schema
    if (!attrs.id) throw new Error(`Element ${tagName} missing required 'id' attribute`);
    const id = String(attrs.id);

    // Build props object, excluding id and xmlns attributes
    const propsObj = Object.fromEntries(
      Object.entries(attrs)
        .filter(([k]) => k !== "id" && !k.startsWith("xmlns") && !k.startsWith("xsi:"))
        .map(([k, v]) => [k, parseValue(v)])
    );

    // Create block first (outer-to-inner ordering), children will be set after processing
    const block: Block = {
      id,
      name: tagName,
      props: JSON.stringify(propsObj),
      children: "[]", // Placeholder, will be updated
    };
    blocks.push(block);

    // Process child elements recursively and collect IDs
    const childIds: string[] = [];
    for (const [childTag, childValue] of children) {
      const items = Array.isArray(childValue) ? childValue : [childValue];
      for (const item of items) {
        const childId = processNode(childTag, item);
        if (childId) childIds.push(childId);
      }
    }
    // Update children with collected IDs
    block.children = JSON.stringify(childIds);

    return id;
  };

  let populatedXmlContent = xmlContent;
  if (variables) {
    populatedXmlContent = _template(xmlContent)(variables);
  }

  // Parse XML with attributes preserved
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    allowBooleanAttributes: true,
    trimValues: true,
  }).parse(populatedXmlContent);

  // Skip <Slate> wrapper if present, process its children directly
  const root = parsed.Slate ?? parsed;
  let rootBlock = "";

  // Process all root-level elements
  for (const [tag, node] of Object.entries(root)) {
    if (tag.startsWith("?") || typeof node !== "object") continue;
    const items = Array.isArray(node) ? node : [node];
    for (const item of items) {
      const id = processNode(tag, item);
      if (id && !rootBlock) rootBlock = id; // First element becomes rootBlock
    }
  }

  return { rootBlock, blocks };
}