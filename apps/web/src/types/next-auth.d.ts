import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    /** users.sessionVersion at sign-in time; see lib/auth/session.ts. */
    sessionVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      /**
       * Optional because JWTs issued before the session-versioning rollout
       * carry no such claim — those are read as 0, matching the column default.
       */
      sessionVersion?: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    sessionVersion?: number;
  }
}
