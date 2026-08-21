import { prisma } from '@/lib/prisma';

export type ActivityLogInput = {
  userEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
  orgSlug?: string;
};

export async function recordActivity({
  userEmail,
  action,
  entityType,
  entityId,
  details,
  orgSlug = 'gusa',
}: ActivityLogInput) {
  try {
    const org = await prisma.organization.findFirst({
      where: { slug: orgSlug },
    });

    const user = userEmail
      ? await prisma.user.findUnique({
          where: { email: userEmail },
        })
      : null;

    await prisma.activityLog.create({
      data: {
        action,
        entityType,
        entityId: entityId ?? null,
        details: details ?? '',
        orgId: org?.id ?? 'system',
        userId: user?.id ?? null,
      },
    });
  } catch {
    // Ignore logging failures so main actions remain stable.
  }
}
