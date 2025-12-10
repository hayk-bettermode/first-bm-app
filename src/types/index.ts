import { Request, Response } from "express";
import { AppNetworkSettings } from "./app";

// Request/Response Types
export interface DynamicBlockRequest {
  type?: string;
  data: {
    interactionId: string;
    appId: string;
    callbackId?: string;
    dynamicBlockKey?: string;
    inputs?: Record<string, string>;
    preview?: boolean;
    actorId?: string;
    actor?: {
      id: string;
    };
  };
  currentSettings?: Array<{
    settings: Record<string, unknown>;
  }>;
  networkId: string;
}

export interface DynamicBlockResponse {
  status: "SUCCEEDED" | "FAILED";
  type: "INTERACTION";
  data: {
    appId: string;
    interactionId: string;
    interactions: InteractionData[];
  };
}

export interface PostData {
  id: string;
  spaceId: string;
  title?: string;
  content?: string;
  url?: string;
  publishedAt?: string;
  actor?: {
    id: string;
    displayName?: string;
    email?: string;
  };
}

export interface WebhookRequest {
  type:
    | "TEST"
    | "UPDATE_SETTINGS"
    | "GET_SETTINGS"
    | "INTERACTION"
    | "SUBSCRIPTION"
    | "POST_PUBLISHED";
  data: {
    challenge?: string;
    settings?: AppNetworkSettings;
    dynamicBlockKey?: string;
    interactionId?: string;
    appId?: string;
    actorId?: string;
    callbackId?: string;
    inputs?: Record<string, string>;
    preview?: boolean;
    post?: PostData;
    object?: PostData; // Alternative field name for post data
    [key: string]: unknown;
  };
  networkId?: string;
  context?: string;
  entityId?: string;
  appId?: string;
  currentSettings?: Array<{
    id: string;
    appId: string;
    networkId: string;
    context: string;
    entityId: string;
    settings: AppNetworkSettings;
  }>;
}

export interface WebhookResponse {
  type: string;
  status: "SUCCEEDED" | "FAILED";
  data?: {
    challenge?: string;
    toStore?: Record<string, string>;
    [key: string]: unknown;
  };
  errorCode?: string;
  errorMessage?: string;
}

export interface InteractionRequest {
  interactionId: string;
  appId: string;
  actorId: string;
  callbackId?: string;
  dynamicBlockKey?: string;
  inputs?: Record<string, string>;
  preview?: boolean;
  networkId: string;
}

export interface InteractionResponse {
  type: "INTERACTION";
  status: "SUCCEEDED" | "FAILED";
  data: {
    appId: string;
    interactionId: string;
    interactions: InteractionData[];
  };
}

export interface SubscriptionResponse {
  type: "SUBSCRIPTION";
  status: "SUCCEEDED" | "FAILED";
  data: Record<string, unknown>;
}

// Express Types
export interface ExpressRequest extends Request {
  rawBody?: Buffer;
}

export interface ExpressResponse extends Response {}

export interface ExpressNextFunction {
  (): void;
}

// Extended Request type for body parser
export interface ExtendedRequest extends Request {
  rawBody?: Buffer;
}

// Body Parser Types
export interface BodyParserRequest {
  rawBody?: Buffer;
}

export interface BodyParserResponse {}

// Middleware Types
export interface SignatureVerificationParams {
  body: Buffer | string;
  timestamp: number;
  signature: string;
  secret: string;
}

// Outbox Event Payload Types
export interface OutboxEventPayload {
  postId: string;
  spaceId: string;
  title?: string;
  url?: string;
  actor?: {
    id: string;
    displayName?: string;
    email?: string;
  };
  publishedAt: string;
}

// Error Types
export interface ApiError {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccess<T = unknown> {
  success: true;
  data?: T;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

export interface SlateStructure {
  rootBlock: string;
  blocks: SlateBlock[] | unknown[];
}

export interface InteractionProps {
  title?: string;
  status?: "success" | "error" | "warning" | "info";
  description?: string;
  link?: {
    href: string;
    text: string;
    enableCopy?: boolean;
  };
  size?: "sm" | "md" | "lg" | "xl";
  items?: Array<{ text: string; value: string }>;
  dynamicBlockKeys?: string[];
  url?: string;
  external?: boolean;
}

export interface InteractionData {
  id: string;
  type: string;
  props: InteractionProps;
  slate?: {
    rootBlock: string;
    blocks: unknown[];
  };
}

// HubSpot Types
// export interface HubSpotTokenResponse {
//   access_token: string;
//   refresh_token: string;
//   expires_in: number;
//   hub_id?: string;
// }

// export interface HubSpotContact {
//   id: string;
//   properties: {
//     email?: string;
//     annualrevenue?: string;
//     lifecyclestage?: string;
//     [key: string]: string | undefined;
//   };
// }

// export interface HubSpotCompany {
//   id: string;
//   properties: {
//     domain?: string;
//     name?: string;
//     [key: string]: string | undefined;
//   };
// }

// export interface HubSpotDeal {
//   id: string;
//   properties: {
//     closedate?: string;
//     dealname?: string;
//     dealstage?: string;
//     pipeline?: string;
//     [key: string]: string | undefined;
//   };
// }

// export interface HubSpotNote {
//   id?: string;
//   properties: {
//     hs_note_body: string;
//     hs_timestamp: string;
//     hubspot_owner_id?: string;
//   };
//   associations?: Array<{
//     to: { id: string };
//     types: Array<{ associationCategory: string; associationTypeId: number }>;
//   }>;
// }

// export interface HubSpotProperty {
//   name: string;
//   label: string;
//   type: string;
//   groupName: string;
//   description?: string;
//   options?: Array<{ label: string; value: string }>;
//   readOnlyValue?: boolean;
//   calculated?: boolean;
// }

// Dynamic Block Types
export interface SlateBlock {
  id: string;
  name: string;
  children: string;
  props: string;
}

// Partial block for building (children can be added later)
export interface SlateBlockPartial {
  id: string;
  name: string;
  props: string;
  children?: string;
}

// Privacy Settings Types
export interface PrivacySettings {
  allow: Array<"ADMIN" | "OWN">;
}

// Member Field Types
export interface MemberFieldInput {
  key: string;
  value: string | number | Date;
  type?: "text" | "number" | "date" | "datetime";
}

// Specific Error Types
export interface ValidationError extends ApiError {
  code: "VALIDATION_ERROR";
  details: {
    field: string;
    message: string;
  };
}

export interface AuthenticationError extends ApiError {
  code: "AUTHENTICATION_ERROR";
  error: "Invalid signature" | "Missing headers" | "Invalid timestamp";
}

export interface NetworkError extends ApiError {
  code: "NETWORK_ERROR";
  error: "Connection failed" | "Timeout" | "Service unavailable";
}

export interface BusinessLogicError extends ApiError {
  code: "BUSINESS_LOGIC_ERROR";
  error: "Invalid settings ID" | "Missing parameter" | "Invalid format";
}

export type SpecificError =
  | ValidationError
  | AuthenticationError
  | NetworkError
  | BusinessLogicError;
