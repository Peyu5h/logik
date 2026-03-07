"use client";

import { useState, useEffect } from "react";
import { getUser, removeUser, setUser, useSignOut } from "~/hooks/useAuth";

export type { UserData } from "~/hooks/useAuth";
export { getUser, setUser, removeUser } from "~/hooks/useAuth";

export const useUser = () => {
  const [user, setUserState] = useState(() => getUser());
  const [isLoading, setIsLoading] = useState(true);
  const signOut = useSignOut();

  useEffect(() => {
    setUserState(getUser());
    setIsLoading(false);
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin",
    isConsumer: user?.role === "consumer",
    signOut,
  };
};

export default useUser;
