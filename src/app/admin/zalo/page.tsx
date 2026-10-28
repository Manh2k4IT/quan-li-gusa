import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { recordActivity } from '@/lib/activity';
import { canAccessModule, getSession } from '@/lib/auth';
import FormSubmitButton from '@/components/form-submit-button';
import { getZaloAppConfig, getZaloSettings, listZaloGroups, sendZaloGroupText, setZaloSettings, ZALO_KEYS, type ZaloGroup } from '@/lib/zalo';
import { notifyNewOrders, sendWeeklyReport, startOfWatch } from '@/lib/zalo-progress';

async function requireManager() {
  const session = getSession(await cookies());
  if (!session || !canAccessModule(session.role, 'admin-users')) redirect('/');
  return session;
}

function done(message: string): never {
  redirect(`/admin/zalo?msg=${encodeURIComponent(message)}`);
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function saveGroup(formData: FormData) {
  'use server';

  const session = await requireManager();
  const [groupId, groupName] = String(formData.get('group') ?? '').split('|');
  if (!groupId) done('Chưa chọn nhóm.');

  const settings = await getZaloSettings();
  await setZaloSettings({
    [ZALO_KEYS.groupId]: groupId,
    [ZALO_KEYS.groupName]: groupName ?? groupId,
    // Only orders from today on are announced; older ones are history.
    [ZALO_KEYS.watchStartedAt]: settings[ZALO_KEYS.watchStartedAt] ?? startOfWatch(),
  });
  await recordActivity({ userEmail: session.email, action: 'set_zalo_group', entityType: 'zalo', details: groupName ?? groupId });
  done(`Đã chọn nhóm "${groupName ?? groupId}" để nhận thông báo.`);
}

async function sendTest() {
  'use server';

  const session = await requireManager();
  let message = 'Đã gửi tin thử vào nhóm Zalo.';
  try {
    await sendZaloGroupText(`✅ Tin thử từ phần mềm GUSA (${session.name}). Nhóm này sẽ nhận thông báo đơn mới và tiến độ khách hàng hằng tuần.`);
  } catch (error) {
    message = `Gửi thất bại: ${errorText(error)}`;
  }
  done(message);
}

async function sendWeeklyNow() {
  'use server';

  await requireManager();
  let message = 'Đã gửi báo cáo tiến độ tuần vào nhóm Zalo.';
  try {
    await sendWeeklyReport();
  } catch (error) {
    message = `Gửi thất bại: ${errorText(error)}`;
  }
  done(message);
}

async function checkOrdersNow() {
  'use server';

  await requireManager();
  let message: string;
  try {
    const sent = await notifyNewOrders();
    message = sent ? `Đã báo ${sent} đơn mới vào nhóm Zalo.` : 'Không có đơn mới nào cần báo.';
  } catch (error) {
    message = `Kiểm tra thất bại: ${errorText(error)}`;
  }
  done(message);
}

async function disconnect() {
  'use server';

  const session = await requireManager();
  await setZaloSettings({
    [ZALO_KEYS.accessToken]: null,
    [ZALO_KEYS.accessTokenExpiresAt]: null,
    [ZALO_KEYS.refreshToken]: null,
    [ZALO_KEYS.groupId]: null,
    [ZALO_KEYS.groupName]: null,
    [ZALO_KEYS.lastError]: null,
  });
  await recordActivity({ userEmail: session.email, action: 'disconnected_zalo', entityType: 'zalo', details: 'Ngắt kết nối Zalo OA' });
  done('Đã ngắt kết nối Zalo OA.');
}

export default async function ZaloSettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireManager();
  const { msg } = await searchParams;
  const app = getZaloAppConfig();
  const settings = await getZaloSettings();
  const connected = Boolean(settings[ZALO_KEYS.refreshToken]);
  const groupId = settings[ZALO_KEYS.groupId];

  let groups: ZaloGroup[] = [];
  let groupsError = '';
  if (connected) {
    try {
      groups = await listZaloGroups();
    } catch (error) {
      groupsError = errorText(error);
    }
  }

  return (
    <main className="users-page">
      <header className="users-header">
        <div>
          <p className="eyebrow">Quản trị hệ thống</p>
          <h1>Thông báo Zalo</h1>
          <p className="users-subtitle">
            Báo vào nhóm Zalo khi khách hàng đang được giao cho sale phát sinh đơn mới (kèm % tiến độ), và gửi báo cáo tiến độ khách hàng mỗi sáng thứ Hai.
          </p>
        </div>
      </header>

      {msg ? <div className="users-card" role="status"><p>{msg}</p></div> : null}

      <div className="users-layout">
        <section className="users-card users-create">
          <div className="users-card-header">
            <h3>1. Kết nối Zalo OA</h3>
            <p>{!app.configured ? 'Thiếu ZALO_APP_ID / ZALO_APP_SECRET trong biến môi trường.' : connected ? 'Đã kết nối.' : 'Chưa kết nối.'}</p>
          </div>
          {app.configured ? (
            <div className="users-form">
              <a className="primary-btn users-submit" href="/api/zalo/connect">{connected ? 'Kết nối lại' : 'Kết nối Zalo OA'}</a>
              {connected ? (
                <form action={disconnect}>
                  <FormSubmitButton className="ghost-btn" pendingLabel="Đang ngắt...">Ngắt kết nối</FormSubmitButton>
                </form>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="users-card users-list">
          <div className="users-card-header">
            <h3>2. Nhóm nhận thông báo</h3>
            <p>{groupId ? `Đang gửi vào: ${settings[ZALO_KEYS.groupName] ?? groupId}` : 'Chưa chọn nhóm.'}</p>
          </div>

          {!connected ? <div className="users-empty">Kết nối Zalo OA trước để chọn nhóm.</div> : null}
          {groupsError ? <div className="users-empty">Không tải được danh sách nhóm: {groupsError}</div> : null}
          {connected && !groupsError && !groups.length ? <div className="users-empty">OA chưa có nhóm nào (cần gói nhóm GMF của Zalo).</div> : null}

          {groups.length ? (
            <form action={saveGroup} className="users-form">
              <label>
                Nhóm Zalo
                <select name="group" defaultValue={groupId ? `${groupId}|${settings[ZALO_KEYS.groupName] ?? ''}` : ''}>
                  <option value="" disabled>Chọn nhóm…</option>
                  {groups.map((group) => (
                    <option key={group.group_id} value={`${group.group_id}|${group.name}`} disabled={group.status !== 'enabled'}>
                      {group.name}{group.total_member ? ` · ${group.total_member} thành viên` : ''}{group.status !== 'enabled' ? ' (đã khóa)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <FormSubmitButton className="primary-btn users-submit" pendingLabel="Đang lưu...">Lưu nhóm</FormSubmitButton>
            </form>
          ) : null}

          {groupId ? (
            <div className="users-form">
              <form action={sendTest}><FormSubmitButton className="ghost-btn" pendingLabel="Đang gửi...">Gửi tin thử</FormSubmitButton></form>
              <form action={checkOrdersNow}><FormSubmitButton className="ghost-btn" pendingLabel="Đang kiểm tra ERP...">Kiểm tra đơn mới ngay</FormSubmitButton></form>
              <form action={sendWeeklyNow}><FormSubmitButton className="ghost-btn" pendingLabel="Đang gửi...">Gửi báo cáo tuần ngay</FormSubmitButton></form>
            </div>
          ) : null}

          <p className="users-subtitle">
            Hệ thống kiểm tra ERP mỗi 5 phút. Báo cáo tuần gần nhất: {settings[ZALO_KEYS.lastWeeklyReport] ?? 'chưa gửi'}.
            {settings[ZALO_KEYS.lastError] ? ` Lỗi gần nhất: ${settings[ZALO_KEYS.lastError]}` : ''}
          </p>
        </section>
      </div>
    </main>
  );
}
