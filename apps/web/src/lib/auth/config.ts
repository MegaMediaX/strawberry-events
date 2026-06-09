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

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
