import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();

const argonOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@strawberry.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!123";
  const orgSlug = process.env.PRETIX_DEFAULT_ORGANIZER ?? "strawberry";

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
      name: "Super Admin",
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

  console.log(`Seeded organization '${org.slug}' and super admin '${adminEmail}'.`);
  console.log("Dev login password:", adminPassword);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
