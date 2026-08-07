import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "./password";
import { rateLimit } from "@/lib/security/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Force the __Secure- cookie prefix + Secure attribute in production.
  useSecureCookies: process.env.NODE_ENV === "production",
  session: {
    // Credentials provider requires JWT sessions (DB sessions are not
    // supported for credentials sign-in in Auth.js).
    strategy: "jwt",
  },
  pages: {
    signIn: "/en/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        // Brute-force / credential-stuffing protection: 5 attempts / 5 min per email.
        // Returns a generic null on block (no account enumeration).
        if (!rateLimit(`login:${parsed.data.email.toLowerCase()}`, 5, 300_000).allowed) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user?.passwordHash) return null;

        const ok = await verifyPassword(user.passwordHash, parsed.data.password);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          // Carried into the JWT so the token records which "generation" of the
          // account it was minted for (see the jwt callback below).
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // `user` is only present on the sign-in call; later invocations just pass
      // the existing token through. That is exactly what we want — the version
      // must be frozen at issue time, not refreshed, or a stolen token would
      // heal itself on the next request and never be evicted.
      if (user?.id) {
        token.userId = user.id;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
        // Surfaced so getSessionContext() can compare it against the live DB
        // value it already loads (no extra query).
        session.user.sessionVersion = token.sessionVersion as number | undefined;
      }
      return session;
    },
  },
});
