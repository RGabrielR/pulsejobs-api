const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function upsertUser(email, password, role) {
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role,
    },
    create: {
      email,
      passwordHash,
      role,
    },
  });
}

async function main() {
  await upsertUser('admin@pulsejobs.dev', 'Admin123!', Role.ADMIN);
  await upsertUser('user@pulsejobs.dev', 'User12345!', Role.USER);

  console.log('Seed completed.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });