import { Request, Response } from "express";
import ApiResponse from "../utils/apiResponse.js";
import { config } from "../config/env.js";

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
): void => {
  let statusCode = 500;
  let message = "Internal Server Error";
  let isOperational = false;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  } else if (err.name === "ValidationError") {
    statusCode = 422;
    message = err.message;
  } else if (err.message) {
    message = err.message;
  }

  if (config.nodeEnv === "development") {
    console.error("Error:", {
      name: err.name,
      message: err.message,
      statusCode,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  if (config.nodeEnv === "production" && !isOperational) {
    message = "Something went wrong";
  }

  ApiResponse.error(res, message, statusCode);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  ApiResponse.notFound(res, `Route ${req.originalUrl} not found`);
};
