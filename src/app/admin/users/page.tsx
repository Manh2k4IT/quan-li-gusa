import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { recordActivity } from '@/lib/activity';
import { canAccessModule, getRoleLabel, getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import FormSubmitButton from '@/components/form-submit-button';

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

  await prisma.user.delete({ where: { id: userId } });

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

  return (
    <main className="page-layout">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin Console</p>
          <h1>Quản lý người dùng</h1>
        </div>
        <Link href="/" className="primary-btn">Quay lại dashboard</Link>
      </div>

      <div className="stats-row">
        <div className="metric-card">
          <span>Người dùng</span>
          <strong>{users.length}</strong>
        </div>
        <div className="metric-card">
          <span>Quản trị viên</span>
          <strong>{users.filter((user) => user.role === 'CEO').length}</strong>
        </div>
        <div className="metric-card">
          <span>Quyền hiện tại</span>
          <strong>{getRoleLabel(session.role)}</strong>
        </div>
      </div>

      <div className="panel add-customer-panel">
        <div className="panel-header">
          <h3>Thêm người dùng mới</h3>
        </div>

        <form action={createUser} className="customer-form">
          <div className="customer-form-grid">
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

            <label>
              Vai trò
              <select name="role" defaultValue="SALE">
                <option value="CEO">CEO</option>
                <option value="MANAGER">Quản lý</option>
                <option value="SALE">Sale</option>
              </select>
            </label>

            <label>
              Phân loại
              <select name="category" defaultValue="Chưa phân loại">
                <option value="Chưa phân loại">Chưa phân loại</option>
                <option value="Thời trang Quận 4">Thời trang Quận 4</option>
                <option value="Kho vải Quận 4">Kho vải Quận 4</option>
                <option value="Kho vải Bến Thành">Kho vải Bến Thành</option>
                <option value="Tổng điều hành">Tổng điều hành</option>
              </select>
            </label>
          </div>

          <FormSubmitButton className="primary-btn" pendingLabel="Đang tạo tài khoản...">Tạo tài khoản</FormSubmitButton>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Danh sách quyền người dùng</h3>
        </div>

        {users.length === 0 ? (
          <div style={{ padding: '16px', color: '#b9d8f8', border: '1px dashed rgba(145, 175, 215, 0.35)', borderRadius: '12px' }}>
            Chưa có người dùng nào. Hãy tạo tài khoản mới ở form phía trên.
          </div>
        ) : (
          <div className="user-table-scroll">
            <table className="data-table">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Vai trò</th>
                <th>Phân loại</th>
                <th>Org</th>
                <th>Ngày tạo</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <form action={updateUserRole}>
                      <input type="hidden" name="userId" value={user.id} />
                      <select name="role" defaultValue={user.role} aria-label={`Role for ${user.name}`}>
                        <option value="CEO">CEO</option>
                        <option value="MANAGER">Quản lý</option>
                        <option value="SALE">Sale</option>
                      </select>
                      <FormSubmitButton className="ghost-btn" style={{ marginTop: '8px' }} pendingLabel="Đang lưu...">Lưu</FormSubmitButton>
                    </form>
                  </td>
                  <td>
                    <form action={updateUserRole}>
                      <input type="hidden" name="userId" value={user.id} />
                      <select name="category" defaultValue={user.category || 'Chưa phân loại'} aria-label={`Category for ${user.name}`}>
                        <option value="Chưa phân loại">Chưa phân loại</option>
                        <option value="Thời trang Quận 4">Thời trang Quận 4</option>
                        <option value="Kho vải Quận 4">Kho vải Quận 4</option>
                        <option value="Kho vải Bến Thành">Kho vải Bến Thành</option>
                        <option value="Tổng điều hành">Tổng điều hành</option>
                      </select>
                      <FormSubmitButton className="ghost-btn" style={{ marginTop: '8px' }} pendingLabel="Đang lưu...">Lưu</FormSubmitButton>
                    </form>
                  </td>
                  <td>{user.org}</td>
                  <td>{user.createdAt}</td>
                  <td>
                    <form action={deleteUser} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                      <input type="hidden" name="userId" value={user.id} />
                      <FormSubmitButton className="ghost-btn danger-btn" pendingLabel="Đang xóa..." aria-label={`Xóa người dùng ${user.name}`}>Xóa</FormSubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
