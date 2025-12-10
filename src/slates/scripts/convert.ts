/**
 * Node script to convert Bettermode Slate XML to JSON
 * Usage: npx ts-node convert.ts <input.xml> <output.json>
 */

import fs from "fs";
import { convertXmlToSlateJson } from "./convertXmlToSlateJson";

function convertXmlFileToJson(src: string, dest: string): void {
  const result = convertXmlToSlateJson(fs.readFileSync(src, "utf-8"), { apiKey: "ABC" });
  fs.writeFileSync(dest, JSON.stringify(result, null, 4), "utf-8");
}

// CLI entry point
const [, , src, dest] = process.argv;
if (!src || !dest) {
  console.error("Usage: npx ts-node convert.ts <input.xml> <output.json>");
  process.exit(1);
}
convertXmlFileToJson(src, dest);
console.log(`Converted ${src} to ${dest}`);
