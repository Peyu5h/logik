import { Response } from "express";
import { ZodError, ZodIssue } from "zod";

export type ApiResponseType<T> = {
  success: boolean;
  data?: T;
  message?: string;
  error?: Array<{
    message: string;
    code?: string;
    path?: string[];
  }>;
};

const transformZodError = (zodError: ZodError) => ({
  errors: zodError.issues.map((error: ZodIssue) => ({
    message: error.message,
    code: "VALIDATION_ERROR",
    path: error.path.map(String),
  })),
});

export const success = <T>(data: T, message?: string): ApiResponseType<T> => ({
  success: true,
  data,
  ...(message && { message }),
});

export const err = (
  message: string,
  path?: string[],
): ApiResponseType<never> => ({
  success: false,
  error: [{ message, code: "ERROR", path }],
});

export const validationErr = (
  error: ZodError | { errors: Array<{ message: string; path?: string[] }> },
): ApiResponseType<never> => ({
  success: false,
  error:
    error instanceof ZodError ? transformZodError(error).errors : error.errors,
});

export class ApiResponse {
  static success<T>(
    res: Response,
    data: T,
    message?: string,
    statusCode: number = 200,
  ): Response {
    return res.status(statusCode).json(success(data, message));
  }

  static created<T>(res: Response, data: T, message?: string): Response {
    return res.status(201).json(success(data, message));
  }

  static error(
    res: Response,
    message: string,
    statusCode: number = 400,
  ): Response {
    return res.status(statusCode).json(err(message));
  }

  static validationError(
    res: Response,
    error: ZodError,
    statusCode: number = 422,
  ): Response {
    return res.status(statusCode).json(validationErr(error));
  }

  static unauthorized(
    res: Response,
    message: string = "Unauthorized",
  ): Response {
    return res.status(401).json(err(message));
  }

  static forbidden(res: Response, message: string = "Forbidden"): Response {
    return res.status(403).json(err(message));
  }

  static notFound(
    res: Response,
    message: string = "Resource not found",
  ): Response {
    return res.status(404).json(err(message));
  }

  static noContent(res: Response): Response {
    return res.status(204).send();
  }
}

export default ApiResponse;
