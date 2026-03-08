"use client";

import { useState, useEffect } from "react";
import { Card } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import useUser from "~/hooks/useUser";
import { useSignIn } from "~/hooks/useAuth";
import { Package, Shield } from "lucide-react";

export default function SignInPage() {
  const { isAuthenticated, isLoading } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signIn = useSignIn();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // redirect handled by useSignIn onSuccess
    }
  }, [isAuthenticated, isLoading]);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    signIn.mutate({ email: email.trim().toLowerCase(), password });
  };

  const handleQuickLogin = (type: "consumer" | "admin") => {
    const credentials = {
      consumer: { email: "mihirgrand@yahoo.com", password: "user123" },
      admin: { email: "admin@logistix.com", password: "admin123" },
    };
    const creds = credentials[type];
    setEmail(creds.email);
    setPassword(creds.password);
    signIn.mutate(creds);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) return null;

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-semibold">Logik</h2>
          <p className="text-muted-foreground mt-1 text-sm">Sign in to your operations dashboard</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={signIn.isPending}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={signIn.isPending}
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={signIn.isPending}>
            {signIn.isPending ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card text-muted-foreground px-2">Quick Access</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleQuickLogin("consumer")}
            disabled={signIn.isPending}
            className="gap-2"
          >
            <Package className="h-4 w-4" />
            Consumer
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleQuickLogin("admin")}
            disabled={signIn.isPending}
            className="gap-2"
          >
            <Shield className="h-4 w-4" />
            Ops Manager
          </Button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-muted-foreground text-sm">
            Don't have an account?{" "}
            <a href="/sign-up" className="text-primary hover:underline">
              Sign up
            </a>
          </p>
        </div>
      </Card>
    </div>
  );
}
