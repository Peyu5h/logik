"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Cookies from "js-cookie";
import api, { getApiErrorMessage } from "~/lib/api/client";
import type { ApiResponse, User, SignInRequest, SignUpRequest } from "~/lib/types";

const USER_COOKIE_KEY = "user";

export type UserData = Pick<User, "id" | "email" | "name" | "role"> & {
  createdAt?: string;
};

export const getUser = (): UserData | null => {
  const raw = Cookies.get(USER_COOKIE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const setUser = (user: UserData) => {
  Cookies.set(USER_COOKIE_KEY, JSON.stringify(user), { expires: 30 });
};

export const removeUser = () => {
  Cookies.remove(USER_COOKIE_KEY);
};

// sign in mutation
export function useSignIn() {
  const router = useRouter();

  return useMutation({
    mutationFn: async (data: SignInRequest) => {
      const res = await api
        .post("api/auth/signin", { json: data })
        .json<ApiResponse<User>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Sign in failed");
      }

      return res.data;
    },
    onSuccess: (userData) => {
      setUser({
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        createdAt: userData.createdAt,
      });

      toast.success("Signed in successfully");

      if (userData.role === "admin") {
        router.replace("/admin");
      } else {
        router.replace("/");
      }
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });
}

// sign up mutation
export function useSignUp() {
  const router = useRouter();

  return useMutation({
    mutationFn: async (data: SignUpRequest) => {
      const res = await api
        .post("api/auth/signup", { json: data })
        .json<ApiResponse<User>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Sign up failed");
      }

      return res.data;
    },
    onSuccess: (userData) => {
      setUser({
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        createdAt: userData.createdAt,
      });

      toast.success("Account created successfully");
      router.replace("/");
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });
}

// sign out helper
export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return () => {
    removeUser();
    queryClient.clear();
    toast.success("Signed out successfully");
    router.push("/sign-in");
  };
}
