import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = params.email;
        if (typeof email !== "string" || email.length === 0) {
          throw new Error("Email is required");
        }
        const name =
          typeof params.name === "string" && params.name.trim().length > 0
            ? params.name.trim()
            : email.split("@")[0];
        return { email, name };
      },
    }),
    Google,
  ],
});
