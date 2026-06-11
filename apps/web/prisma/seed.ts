import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();

const argonOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

async function main() {
  // The single bootstrap super admin (Marven). In production set
  // SEED_ADMIN_PASSWORD to a strong secret in the environment — it is
  // argon2id-hashed below and the plaintext is NEVER stored in the repo or DB.
  // The placeholder fallback is intentionally weak so a prod seed without the
  // env var fails loudly (see the guard below).
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "marvenmouaalem@gmail.com";
  const adminName = process.env.SEED_ADMIN_NAME ?? "Marven";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!123";
  const orgSlug = process.env.PRETIX_DEFAULT_ORGANIZER ?? "strawberry";

  if (process.env.NODE_ENV === "production" && !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      "Refusing to seed a production super admin with the placeholder password. " +
        "Set SEED_ADMIN_PASSWORD (and optionally SEED_ADMIN_EMAIL/SEED_ADMIN_NAME) first.",
    );
  }

  const org = await prisma.organization.upsert({
    where: { slug: orgSlug },
    update: {},
    create: {
      name: "Strawberry Agency",
      slug: orgSlug,
      pretixOrganizerSlug: orgSlug,
      status: "active",
    },
  });

  const passwordHash = await hash(adminPassword, argonOptions);
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      emailVerified: new Date(),
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId: user.id },
    },
    update: { role: "super_admin" },
    create: {
      organizationId: org.id,
      userId: user.id,
      role: "super_admin",
    },
  });

  console.log(`Seeded organization '${org.slug}' and super admin '${adminName}' <${adminEmail}>.`);
  // Only ever echo the plaintext outside production (local dev convenience).
  if (process.env.NODE_ENV !== "production") {
    console.log("Dev login password:", adminPassword);
  } else {
    console.log("Super admin password set from SEED_ADMIN_PASSWORD (not logged).");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
