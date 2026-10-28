import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { recordActivity } from '@/lib/activity';
import { recordAssignmentResultsSafely } from '@/lib/assignment-history';
import { canAccessModule, getRoleLabel, getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import FormSubmitButton from '@/components/form-submit-button';
import PasswordToggle from '@/components/password-toggle';
import { Icon, type IconName } from '@/components/icons';

const ROLE_OPTIONS = [
  { value: 'CEO', label: 'CEO' },
  { value: 'MANAGER', label: 'Quản lý' },
  { value: 'SALE', label: 'Sale' },
] as const;

const CATEGORY_OPTIONS = ['Chưa phân loại', 'Thời trang Quận 4', 'Kho vải Quận 4', 'Kho vải Bến Thành', 'Tổng điều hành'];

async function getUsers() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { organization: true },
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      category: user.category,
      password: user.password,
      org: user.organization.name,
      createdAt: new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(user.createdAt),
    }));
  } catch {
    return [];
  }
}

async function updateUserRole(formData: FormData) {
  'use server';

  const session = getSession(await cookies());

  if (!session || (session.role !== 'CEO' && session.role !== 'MANAGER')) {
    return;
  }

  const userId = String(formData.get('userId') ?? '').trim();

  if (!userId) {
    return;
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  const roleValue = String(formData.get('role') ?? targetUser?.role ?? 'SALE');
  const role = (['CEO', 'MANAGER', 'SALE'].includes(roleValue) ? roleValue : 'SALE') as 'CEO' | 'MANAGER' | 'SALE';
  const categoryValue = String(formData.get('category') ?? targetUser?.category ?? 'Chưa phân loại');
  const category = ['Thời trang Quận 4', 'Kho vải Quận 4', 'Kho vải Bến Thành', 'Tổng điều hành', 'Chưa phân loại'].includes(categoryValue)
    ? categoryValue
    : 'Chưa phân loại';

  await prisma.user.update({
    where: { id: userId },
    data: {
      role,
      category,
    },
  });

  await recordActivity({
    userEmail: session.email,
    action: 'updated_role',
    entityType: 'user',
    entityId: userId,
    details: `${targetUser?.name ?? 'User'} → ${role}`,
  });

  revalidatePath('/admin/users');
}

async function createUser(formData: FormData) {
  'use server';

  const session = getSession(await cookies());

  if (!session || (session.role !== 'CEO' && session.role !== 'MANAGER')) {
    return;
  }

  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '').trim();
  const rawRole = String(formData.get('role') ?? 'SALE');
  const rawCategory = String(formData.get('category') ?? 'Chưa phân loại');
  const role = (['CEO', 'MANAGER', 'SALE'].includes(rawRole) ? rawRole : 'SALE') as 'CEO' | 'MANAGER' | 'SALE';
  const category = ['Thời trang Quận 4', 'Kho vải Quận 4', 'Kho vải Bến Thành', 'Tổng điều hành', 'Chưa phân loại'].includes(rawCategory)
    ? rawCategory
    : 'Chưa phân loại';

  if (!name || !email || !password) {
    return;
  }

  const org = await prisma.organization.findFirst({ where: { slug: 'gusa' } });

  if (!org) {
    return;
  }

  const created = await prisma.user.upsert({
    where: { email },
    update: { name, role, category, password },
    create: {
      email,
      name,
      password,
      role,
      category,
      orgId: org.id,
    },
  });

  await recordActivity({
    userEmail: session.email,
    action: 'created_user',
    entityType: 'user',
    entityId: created.id,
    details: `${name} (${email}) assigned ${role}`,
  });

  revalidatePath('/admin/users');
}

async function deleteUser(formData: FormData) {
  'use server';

  const session = getSession(await cookies());

  if (!session || (session.role !== 'CEO' && session.role !== 'MANAGER')) {
    return;
  }

  const userId = String(formData.get('userId') ?? '').trim();

  if (!userId) {
    return;
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });

  if (!targetUser) {
    return;
  }

  if (targetUser.email.toLowerCase() === session.email.toLowerCase()) {
    return;
  }

  // Their customer assignments are deleted with them; keep each period's result first.
  await recordAssignmentResultsSafely({ saleId: userId }, 'removed');

  const actor = await prisma.user.findUnique({ where: { email: session.email.toLowerCase() }, select: { id: true } });

  // Foreign keys block deleting a user who still owns records, so detach or hand them over first.
  // Revenue reports keep the salesperson's name and email; plans and customers they handed out move to whoever deletes them.
  await prisma.$transaction([
    prisma.salesReport.updateMany({ where: { salespersonId: userId }, data: { salespersonId: null } }),
    prisma.activityLog.updateMany({ where: { userId }, data: { userId: null } }),
    prisma.salesAssignment.deleteMany({ where: { assigneeId: userId } }),
    ...(actor
      ? [
          prisma.salesAssignment.updateMany({ where: { managerId: userId }, data: { managerId: actor.id } }),
          prisma.customerAssignment.updateMany({ where: { assignedById: userId, saleId: { not: userId } }, data: { assignedById: actor.id } }),
        ]
      : [prisma.salesAssignment.deleteMany({ where: { managerId: userId } })]),
    prisma.document.deleteMany({ where: { ownerId: userId } }),
    prisma.dashboard.deleteMany({ where: { ownerId: userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  await recordActivity({
    userEmail: session.email,
    action: 'deleted_user',
    entityType: 'user',
    entityId: userId,
    details: `${targetUser.name} (${targetUser.email}) deleted`,
  });

  revalidatePath('/admin/users');
}

export default async function AdminUsersPage() {
  const session = getSession(await cookies());

  if (!session) {
    redirect('/login');
  }

  if (!canAccessModule(session.role, 'admin-users')) {
    redirect('/');
  }

  const users = await getUsers();
  const roleCounts = {
    CEO: users.filter((user) => user.role === 'CEO').length,
    MANAGER: users.filter((user) => user.role === 'MANAGER').length,
    SALE: users.filter((user) => user.role === 'SALE').length,
  };
  const stats: { label: string; value: number; icon: IconName; tone: string }[] = [
    { label: 'Tổng người dùng', value: users.length, icon: 'users', tone: 'indigo' },
    { label: 'CEO', value: roleCounts.CEO, icon: 'sparkles', tone: 'violet' },
    { label: 'Quản lý', value: roleCounts.MANAGER, icon: 'userCheck', tone: 'cyan' },
    { label: 'Sale', value: roleCounts.SALE, icon: 'target', tone: 'emerald' },
  ];

  return (
    <main className="users-page">
      <header className="users-header">
        <div>
          <p className="eyebrow">Quản trị hệ thống</p>
          <h1>Quản lý người dùng</h1>
          <p className="users-subtitle">Tạo tài khoản, phân quyền và phân loại nhân sự theo kho. Bạn đang đăng nhập với quyền {getRoleLabel(session.role)}.</p>
        </div>
      </header>

      <section className="users-stats">
        {stats.map((stat) => (
          <div key={stat.label} className={`users-stat users-stat-${stat.tone}`}>
            <span className="users-stat-icon"><Icon name={stat.icon} size={20} /></span>
            <div>
              <small>{stat.label}</small>
              <strong>{stat.value}</strong>
            </div>
          </div>
        ))}
      </section>

      <div className="users-layout">
        <section className="users-card users-create">
          <div className="users-card-header">
            <h3>Thêm người dùng</h3>
            <p>Email đã tồn tại sẽ được cập nhật thông tin.</p>
          </div>

          <form action={createUser} className="users-form">
            <label>
              Họ tên
              <input name="name" type="text" placeholder="Nguyễn Văn B" required />
            </label>
            <label>
              Email
              <input name="email" type="email" placeholder="user@gusa.io" required />
            </label>
            <label>
              Mật khẩu
              <input name="password" type="password" placeholder="Nhập mật khẩu" required />
            </label>
            <div className="users-form-row">
              <label>
                Vai trò
                <select name="role" defaultValue="SALE">
                  {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                Phân loại
                <select name="category" defaultValue="Chưa phân loại">
                  {CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <FormSubmitButton className="primary-btn users-submit" pendingLabel="Đang tạo tài khoản...">Tạo tài khoản</FormSubmitButton>
          </form>
        </section>

        <section className="users-card users-list">
          <div className="users-card-header">
            <h3>Danh sách người dùng</h3>
            <span className="users-count">{users.length} tài khoản</span>
          </div>

          {users.length === 0 ? (
            <div className="users-empty">Chưa có người dùng nào. Hãy tạo tài khoản mới ở form bên cạnh.</div>
          ) : (
            <div className="users-table-scroll">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Người dùng</th>
                    <th>Vai trò &amp; phân loại</th>
                    <th>Mật khẩu</th>
                    <th>Ngày tạo</th>
                    <th aria-label="Xóa" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isSelf = user.email.toLowerCase() === session.email.toLowerCase();

                    return (
                      <tr key={user.id}>
                        <td>
                          <div className="users-identity">
                            <span className={`users-avatar users-avatar-${user.role.toLowerCase()}`}>{user.name.charAt(0).toUpperCase()}</span>
                            <div>
                              <strong>
                                {user.name}
                                {isSelf ? <span className="users-self">Bạn</span> : null}
                              </strong>
                              <small>{user.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <form action={updateUserRole} className="users-role-form">
                            <input type="hidden" name="userId" value={user.id} />
                            <select name="role" defaultValue={user.role} aria-label={`Vai trò của ${user.name}`} className={`users-role-select users-role-${user.role.toLowerCase()}`}>
                              {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            <select name="category" defaultValue={user.category || 'Chưa phân loại'} aria-label={`Phân loại của ${user.name}`}>
                              {CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                            <FormSubmitButton className="ghost-btn users-save" pendingLabel="Đang lưu...">Lưu</FormSubmitButton>
                          </form>
                        </td>
                        <td><PasswordToggle password={user.password} userName={user.name} /></td>
                        <td className="users-date">{user.createdAt}</td>
                        <td>
                          <form action={deleteUser}>
                            <input type="hidden" name="userId" value={user.id} />
                            <FormSubmitButton
                              className="users-delete"
                              pendingLabel="…"
                              disabled={isSelf}
                              aria-label={isSelf ? 'Không thể xóa tài khoản đang đăng nhập' : `Xóa người dùng ${user.name}`}
                            >
                              <Icon name="trash" size={16} />
                            </FormSubmitButton>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
