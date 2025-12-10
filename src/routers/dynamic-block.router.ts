import express, { Request, Response } from "express";
import { DynamicBlockController } from "../controllers";
import { ErrorHandler } from "../utils";

const router = express.Router();

router.post("/app-settings", async (req: Request, res: Response) => {
  try {
    const response =
      await DynamicBlockController.getInstance().getAppSettingsDynamicBlock(
        req.body,
      );
    res.json(response);
  } catch (error) {
    console.error("Dynamic block error:", error);
    const errorResponse = ErrorHandler.handleUnexpectedError(
      error,
      "dynamic-block-router",
    );
    res.status(500).json(errorResponse);
  }
});

export { router as dynamicBlockRouter };
