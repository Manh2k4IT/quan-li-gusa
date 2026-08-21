import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient();

try {
  const org = await prisma.organization.findFirst({ where: { slug: 'gusa' } });
  console.log('orgId:', org?.id);

  if (!org) {
    throw new Error('Organization gusa not found');
  }

  const result = await prisma.user.upsert({
    where: { email: 'manh123@gmail.com' },
    update: {
      name: 'manh',
      role: 'SALE',
      category: 'Kho vải Quận 4',
    },
    create: {
      email: 'manh123@gmail.com',
      name: 'manh',
      role: 'SALE',
      category: 'Kho vải Quận 4',
      orgId: org.id,
    },
  });

  console.log('upsert ok:', result.id);
} catch (error) {
  console.error('upsert failed');
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
