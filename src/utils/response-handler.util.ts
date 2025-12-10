import { Request, Response } from "express";
import { ApiResponse, ApiError } from "../types";

export function handleResponse(
  req: Request,
  res: Response,
  data: ApiResponse,
): Response {
  if (!data) {
    return res.status(400).json({
      success: false,
      error: "Internal server error",
    });
  }

  if (data.success) {
    return res.json(data);
  } else {
    return res.status(400).json({
      success: false,
      error: (data as ApiError).error || "Bad request",
    });
  }
}
