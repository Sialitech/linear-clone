"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/format";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  name: z.string().trim().min(1, "Enter your name").optional(),
});

export default function AuthScreen({ mode }: { mode: "signIn" | "signUp" }) {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = credentialsSchema.safeParse({
      email,
      password,
      name: mode === "signUp" ? name : undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setPending(true);
    try {
      const result = await signIn("password", {
        email: parsed.data.email,
        password: parsed.data.password,
        flow: mode === "signUp" ? "signUp" : "signIn",
        ...(mode === "signUp" ? { name: parsed.data.name ?? "" } : {}),
      });
      if (result.signingIn) {
        router.push("/");
        router.refresh();
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function onGoogle() {
    setPending(true);
    try {
      await signIn("google", { redirectTo: "/" });
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
            L
          </span>
          <span className="text-sm font-medium">Linear</span>
        </div>
        <h1 className="text-xl font-medium tracking-tight">
          {mode === "signIn" ? "Welcome back" : "Create your workspace"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signIn"
            ? "Sign in to track issues with your team."
            : "Start with email. A workspace is created for you."}
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          {mode === "signUp" ? (
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              minLength={8}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {mode === "signIn" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          className="mt-2 w-full"
          disabled={pending}
          onClick={() => void onGoogle()}
        >
          Continue with Google
        </Button>
        <p className="mt-6 text-sm text-muted-foreground">
          {mode === "signIn" ? "New here?" : "Already have an account?"}{" "}
          <a
            href={mode === "signIn" ? "/signup" : "/login"}
            className="text-foreground underline-offset-4 hover:underline"
          >
            {mode === "signIn" ? "Create an account" : "Sign in"}
          </a>
        </p>
      </div>
    </main>
  );
}
