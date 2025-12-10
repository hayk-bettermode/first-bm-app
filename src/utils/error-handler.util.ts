import { Logger } from "@tribeplatform/node-logger";
import {
  ApiError,
  ValidationError,
  AuthenticationError,
  NetworkError,
  BusinessLogicError,
  SpecificError,
} from "../types";

export class ErrorHandler {
  private static logger: Logger;

  static initialize(context: string): void {
    this.logger = new Logger({
      applicationName: process.env.LOGGING_APP_KEY!,
      context,
    });
  }

  static createValidationError(
    field: string,
    message: string,
  ): ValidationError {
    return {
      success: false,
      error: `Validation failed for field: ${field}`,
      code: "VALIDATION_ERROR",
      details: { field, message },
    };
  }

  static createAuthenticationError(
    error: AuthenticationError["error"],
  ): AuthenticationError {
    return {
      success: false,
      error,
      code: "AUTHENTICATION_ERROR",
    };
  }

  static createNetworkError(error: NetworkError["error"]): NetworkError {
    return {
      success: false,
      error,
      code: "NETWORK_ERROR",
    };
  }

  static createBusinessLogicError(
    error: BusinessLogicError["error"],
  ): BusinessLogicError {
    return {
      success: false,
      error,
      code: "BUSINESS_LOGIC_ERROR",
    };
  }

  static logError(error: Error | SpecificError, context?: string): void {
    if (this.logger) {
      if (error instanceof Error) {
        this.logger.error(
          `Error in ${context || "unknown context"}:`,
          error.message,
          error.stack,
        );
      } else {
        this.logger.error(
          `Error in ${context || "unknown context"}:`,
          error.error,
          error,
        );
      }
    } else {
      console.error(`Error in ${context || "unknown context"}:`, error);
    }
  }

  static handleUnexpectedError(error: unknown, context?: string): ApiError {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    this.logError(error as Error, context);

    return {
      success: false,
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      details: { originalError: errorMessage },
    };
  }
}
