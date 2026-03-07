import { Request, Response } from "express";
import bcrypt from "bcrypt";
import prisma from "../config/database.js";
import ApiResponse from "../utils/apiResponse.js";
import { signUpSchema, signInSchema } from "../schemas/authSchema.js";

export const signUp = async (req: Request, res: Response) => {
  try {
    const result = signUpSchema.safeParse(req.body);
    if (!result.success) {
      return ApiResponse.validationError(res, result.error);
    }

    const { name, email, password } = result.data;

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return ApiResponse.error(res, "User with this email already exists", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: "user",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return ApiResponse.created(res, user, "Account created successfully");
  } catch (error) {
    console.error("SignUp error:", error);
    return ApiResponse.error(res, "Failed to create account", 500);
  }
};

// signin
export const signIn = async (req: Request, res: Response) => {
  try {
    const result = signInSchema.safeParse(req.body);
    if (!result.success) {
      return ApiResponse.validationError(res, result.error);
    }

    const { email, password } = result.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return ApiResponse.unauthorized(res, "Invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return ApiResponse.unauthorized(res, "Invalid email or password");
    }

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };

    return ApiResponse.success(res, userData, "Signed in successfully");
  } catch (error) {
    console.error("SignIn error:", error);
    return ApiResponse.error(res, "Failed to sign in", 500);
  }
};
