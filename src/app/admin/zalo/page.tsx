import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { recordActivity } from '@/lib/activity';
import { canAccessModule, getSession } from '@/lib/auth';
import FormSubmitButton from '@/components/form-submit-button';
import { Icon, type IconName } from '@/components/icons';
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

  const groupName = settings[ZALO_KEYS.groupName] ?? groupId;
  const lastWeekly = settings[ZALO_KEYS.lastWeeklyReport];
  // Stored as "<ISO time> · <message>"; shown in Vietnam time.
  const [lastErrorAt, ...lastErrorText] = (settings[ZALO_KEYS.lastError] ?? '').split(' · ');
  const lastError = settings[ZALO_KEYS.lastError]
    ? { at: new Date(lastErrorAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }), text: lastErrorText.join(' · ') }
    : null;
  const flashIsError = msg ? /thất bại|lỗi|hết hạn|thiếu|chưa chọn|không tải|không hợp lệ|không trả về/i.test(msg) : false;

  const stats: { label: string; value: string; hint: string; icon: IconName; tone: string; ok: boolean }[] = [
    { label: 'Zalo OA', value: connected ? 'Đã kết nối' : 'Chưa kết nối', hint: !app.configured ? 'Thiếu ZALO_APP_ID / SECRET' : connected ? 'Token tự làm mới' : 'Bấm Kết nối Zalo OA', icon: 'message', tone: connected ? 'emerald' : 'rose', ok: connected },
    { label: 'Nhóm nhận thông báo', value: groupName ?? 'Chưa chọn', hint: !groupId ? 'Chọn nhóm ở bên dưới' : connected ? 'Đang nhận tin tự động' : 'Tạm dừng · chưa kết nối OA', icon: 'users', tone: groupId ? 'cyan' : 'rose', ok: Boolean(groupId) && connected },
    { label: 'Báo cáo tuần gần nhất', value: lastWeekly ? lastWeekly.split('-').reverse().join('/') : 'Chưa gửi', hint: 'Tự động 8:00 sáng thứ Hai', icon: 'calendar', tone: 'violet', ok: Boolean(lastWeekly) },
  ];

  const actions: { title: string; description: string; icon: IconName; action: () => Promise<void>; label: string; pending: string }[] = [
    { title: 'Gửi tin thử', description: 'Kiểm tra OA gửi được vào nhóm.', icon: 'send', action: sendTest, label: 'Gửi thử', pending: 'Đang gửi...' },
    { title: 'Kiểm tra đơn mới', description: 'Quét ERP ngay, không chờ 5 phút.', icon: 'package', action: checkOrdersNow, label: 'Kiểm tra ngay', pending: 'Đang quét ERP...' },
    { title: 'Báo cáo tuần', description: 'Gửi tiến độ khách hàng ngay bây giờ.', icon: 'chart', action: sendWeeklyNow, label: 'Gửi báo cáo', pending: 'Đang gửi...' },
  ];

  return (
    <main className="users-page zalo-page">
      <header className="users-header">
        <div>
          <p className="eyebrow">Quản trị hệ thống</p>
          <h1>Thông báo Zalo</h1>
          <p className="users-subtitle">Tự động báo vào nhóm Zalo khi khách được giao phát sinh đơn, và gửi báo cáo tiến độ khách hàng mỗi tuần.</p>
        </div>
      </header>

      {msg ? (
        <div className={`zalo-flash ${flashIsError ? 'is-error' : 'is-success'}`} role="status">
          <Icon name={flashIsError ? 'close' : 'userCheck'} size={18} />
          <span>{msg}</span>
        </div>
      ) : null}

      <section className="users-stats zalo-stats">
        {stats.map((stat) => (
          <div key={stat.label} className={`users-stat users-stat-${stat.tone}`}>
            <span className="users-stat-icon"><Icon name={stat.icon} size={20} /></span>
            <div className="zalo-stat-body">
              <small>{stat.label}</small>
              <strong title={stat.value}>{stat.value}</strong>
              <span className={`zalo-dot ${stat.ok ? 'is-on' : 'is-off'}`}>{stat.hint}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="zalo-grid">
        <section className="users-card">
          <div className="users-card-header">
            <h3>Thiết lập</h3>
            <p>Hai bước để bắt đầu nhận thông báo.</p>
          </div>

          <ol className="zalo-steps">
            <li className={connected ? 'is-done' : ''}>
              <span className="zalo-step-badge">1</span>
              <div className="zalo-step-body">
                <strong>Kết nối Zalo OA</strong>
                <p>{!app.configured ? 'Thêm ZALO_APP_ID và ZALO_APP_SECRET vào biến môi trường trên Render.' : connected ? 'OA đã cấp quyền cho phần mềm.' : 'Đăng nhập Zalo và đồng ý cấp quyền cho phần mềm.'}</p>
                {app.configured ? (
                  <div className="zalo-row">
                    <a className={connected ? 'ghost-btn' : 'primary-btn'} href="/api/zalo/connect">{connected ? 'Kết nối lại' : 'Kết nối Zalo OA'}</a>
                    {connected ? (
                      <form action={disconnect}>
                        <FormSubmitButton className="ghost-btn zalo-danger" pendingLabel="Đang ngắt...">Ngắt kết nối</FormSubmitButton>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>

            <li className={groupId ? 'is-done' : ''}>
              <span className="zalo-step-badge">2</span>
              <div className="zalo-step-body">
                <strong>Chọn nhóm nhận thông báo</strong>
                <p>Nhóm phải do OA quản lý (gói nhóm GMF).</p>
                {!connected ? <div className="users-empty">Kết nối Zalo OA trước để chọn nhóm.</div> : null}
                {groupsError ? <div className="users-empty">Không tải được danh sách nhóm: {groupsError}</div> : null}
                {connected && !groupsError && !groups.length ? <div className="users-empty">OA chưa có nhóm nào.</div> : null}
                {groups.length ? (
                  <form action={saveGroup} className="zalo-row">
                    <select name="group" className="zalo-select" defaultValue={groupId ? `${groupId}|${settings[ZALO_KEYS.groupName] ?? ''}` : ''} aria-label="Nhóm Zalo">
                      <option value="" disabled>Chọn nhóm…</option>
                      {groups.map((group) => (
                        <option key={group.group_id} value={`${group.group_id}|${group.name}`} disabled={group.status !== 'enabled'}>
                          {group.name}{group.total_member ? ` · ${group.total_member} thành viên` : ''}{group.status !== 'enabled' ? ' (đã khóa)' : ''}
                        </option>
                      ))}
                    </select>
                    <FormSubmitButton className="primary-btn" pendingLabel="Đang lưu...">Lưu nhóm</FormSubmitButton>
                  </form>
                ) : null}
              </div>
            </li>
          </ol>
        </section>

        <section className="users-card">
          <div className="users-card-header">
            <h3>Lịch tự động</h3>
            <p>Chạy trên server, không cần mở phần mềm.</p>
          </div>
          <ul className="zalo-schedule">
            <li>
              <span className="zalo-schedule-icon"><Icon name="clock" size={18} /></span>
              <div>
                <strong>Đơn mới của khách được giao</strong>
                <p>Quét ERP mỗi 5 phút · báo tên khách, giá trị đơn, % tiến độ khách và sale.</p>
              </div>
            </li>
            <li>
              <span className="zalo-schedule-icon"><Icon name="calendar" size={18} /></span>
              <div>
                <strong>Báo cáo tiến độ tuần</strong>
                <p>8:00 sáng thứ Hai · chia khách có đơn và không có đơn trong tuần qua.</p>
              </div>
            </li>
          </ul>
          {lastError ? (
            <div className="zalo-error">
              <strong>Lỗi gần nhất · {lastError.at}</strong>
              <span>{lastError.text}</span>
            </div>
          ) : null}
        </section>
      </div>

      {groupId ? (
        <section className="users-card zalo-actions-card">
          <div className="users-card-header">
            <h3>Gửi thủ công</h3>
            <p>Dùng khi muốn kiểm tra hoặc gửi ngay, không chờ lịch.</p>
          </div>
          <div className="zalo-actions">
            {actions.map((item) => (
              <form key={item.title} action={item.action} className="zalo-action">
                <span className="zalo-action-icon"><Icon name={item.icon} size={20} /></span>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <FormSubmitButton className="ghost-btn" pendingLabel={item.pending}>{item.label}</FormSubmitButton>
              </form>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
