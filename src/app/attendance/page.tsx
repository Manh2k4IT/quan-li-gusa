import Link from 'next/link';
import AttendanceFilters from '@/components/attendance-filters';

export const dynamic = 'force-dynamic';

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1XB_kQUA-JbBUrcAWvZe_b2obMsAcW0lnRU--k3bHDVU/export?format=csv&gid=2025426159';

type AttendanceRow = {
  timestamp: string;
  name: string;
  department: string;
  action: string;
};

type AttendanceSummary = AttendanceRow & {
  date: string;
  time: string;
};

type LateArrival = AttendanceSummary & {
  lateMinutes?: number;
  missingCheckIn?: boolean;
};

type AttendancePair = {
  date: string;
  name: string;
  department: string;
  checkIn?: string;
  checkOut?: string;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }

  values.push(value.trim());
  return values;
}

function parseDateTime(timestamp: string) {
  const match = timestamp.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}:\d{2}:\d{2})$/);
  if (!match) return null;

  const [, day, month, year, time] = match;
  return {
    date: `${year}-${month}-${day}`,
    time,
  };
}

function getMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours * 60) + minutes;
}

function normalizePersonName(name: string) {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getNameDisplayScore(name: string) {
  return [...name].filter((character) => /[^\u0000-\u007f]/.test(character)).length;
}

function getDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const current = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getActiveMemberCutoff() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const year = cutoff.getFullYear();
  const month = String(cutoff.getMonth() + 1).padStart(2, '0');
  const day = String(cutoff.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function getAttendanceRows(): Promise<AttendanceSummary[]> {
  const response = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`);

  const lines = (await response.text()).split(/\r?\n/).filter(Boolean);
  return lines.slice(1).flatMap((line) => {
    const columns = parseCsvLine(line);
    const parsedDateTime = parseDateTime(columns[0] ?? '');
    const action = (columns[16] ?? '').toLowerCase().replace(/\s+/g, '');
    const normalizedAction = action.replace(/-/g, '');
    const actionType = normalizedAction === 'checkin'
      ? 'Check-in'
      : normalizedAction === 'checkout'
        ? 'Check-out'
        : null;
    if (!parsedDateTime || !columns[1] || !actionType) return [];

    return [{
      timestamp: columns[0],
      name: columns[1],
      department: columns[2] || 'Chưa phân bộ phận',
      action: actionType,
      ...parsedDateTime,
    }];
  });
}

type AttendancePageProps = {
  searchParams: Promise<{ member?: string; mode?: string; date?: string; from?: string; to?: string }>;
};

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  let rows: AttendanceSummary[] = [];
  let error = '';
  const filters = await searchParams;
  const filterMode = filters.mode === 'range' ? 'range' : 'date';
  const selectedDate = filters.date ?? (!filters.mode ? getTodayDate() : undefined);

  try {
    rows = await getAttendanceRows();
  } catch {
    error = 'Không thể tải dữ liệu từ Google Sheets lúc này.';
  }

  const activeMemberKeys = new Set(rows
    .filter((row) => row.date >= getActiveMemberCutoff())
    .map((row) => normalizePersonName(row.name)));
  const activeRows = rows.filter((row) => activeMemberKeys.has(normalizePersonName(row.name)));
  const memberLabels = new Map<string, string>();
  activeRows.forEach((row) => {
    const key = normalizePersonName(row.name);
    const currentLabel = memberLabels.get(key);
    if (!currentLabel || getNameDisplayScore(row.name) > getNameDisplayScore(currentLabel)) {
      memberLabels.set(key, row.name.trim());
    }
  });
  const members = [...memberLabels.values()].sort((left, right) => left.localeCompare(right, 'vi'));
  const filteredRows = activeRows.filter((row) => {
    const matchesMember = !filters.member || normalizePersonName(row.name) === normalizePersonName(filters.member);
    const matchesDate = filterMode !== 'date' || !selectedDate || row.date === selectedDate;
    const matchesFromDate = filterMode !== 'range' || !filters.from || row.date >= filters.from;
    const matchesToDate = filterMode !== 'range' || !filters.to || row.date <= filters.to;
    return matchesMember && matchesDate && matchesFromDate && matchesToDate;
  });
  const observedAttendancePairs = [...filteredRows.reduce((pairs, row) => {
    const key = `${row.date}|${normalizePersonName(row.name)}|${row.department}`;
    const current = pairs.get(key) ?? { date: row.date, name: row.name, department: row.department };
    if (getNameDisplayScore(row.name) > getNameDisplayScore(current.name)) current.name = row.name;

    if (row.action === 'Check-in' && (!current.checkIn || row.time < current.checkIn)) current.checkIn = row.time;
    if (row.action === 'Check-out' && getMinutes(row.time) >= (17 * 60)
      && (!current.checkOut || row.time > current.checkOut)) current.checkOut = row.time;
    pairs.set(key, current);
    return pairs;
  }, new Map<string, AttendancePair>()).values()].sort((left, right) => {
    const leftKey = `${left.date} ${left.checkIn ?? left.checkOut ?? ''}`;
    const rightKey = `${right.date} ${right.checkIn ?? right.checkOut ?? ''}`;
    return rightKey.localeCompare(leftKey);
  }).slice(0, 80);
    const selectedStartDate = filterMode === 'date' ? selectedDate : (filters.from ?? filters.to);
    const selectedEndDate = filterMode === 'date' ? filters.date : (filters.to ?? filters.from);
    const reportDates = selectedStartDate && selectedEndDate
      ? getDateRange(selectedStartDate <= selectedEndDate ? selectedStartDate : selectedEndDate, selectedStartDate <= selectedEndDate ? selectedEndDate : selectedStartDate)
      : [...new Set(filteredRows.map((row) => row.date))].sort();
    const departmentsByMember = new Map<string, string>();
    activeRows.forEach((row) => departmentsByMember.set(normalizePersonName(row.name), row.department));
    const reportMemberKeys = filters.member
      ? [normalizePersonName(filters.member)]
      : [...memberLabels.keys()];
    const observedPairsByKey = new Map(observedAttendancePairs.map((row) => [`${row.date}|${normalizePersonName(row.name)}|${row.department}`, row]));
    const attendancePairs = reportDates.flatMap((date) => reportMemberKeys.map((memberKey) => {
      const department = departmentsByMember.get(memberKey) ?? 'Chưa phân bộ phận';
      return observedPairsByKey.get(`${date}|${memberKey}|${department}`) ?? {
        date,
        name: memberLabels.get(memberKey) ?? memberKey,
        department,
      };
    }));
    const completedAttendancePairs = attendancePairs.filter((row) => row.checkIn && row.checkOut);
  const checkIns = filteredRows.filter((row) => row.action === 'Check-in').length;
  const checkOuts = filteredRows.filter((row) => row.action === 'Check-out').length;
  const people = new Set(filteredRows.map((row) => normalizePersonName(row.name))).size;
  const incomplete = Math.abs(checkIns - checkOuts);
  const lateArrivals: LateArrival[] = filteredRows
    .filter((row) => {
      const checkInMinutes = getMinutes(row.time);
      return row.action === 'Check-in'
        && checkInMinutes > (8 * 60 + 30)
        && checkInMinutes < (9 * 60);
    })
    .map((row) => ({ ...row, lateMinutes: getMinutes(row.time) - (8 * 60 + 30) }));
  const lateRequestArrivals = filteredRows.filter((row) => {
    const checkInMinutes = getMinutes(row.time);
    return row.action === 'Check-in'
      && checkInMinutes >= (9 * 60)
      && checkInMinutes <= (17 * 60);
  });
  const earlyDepartureRows = filteredRows.filter((row) => {
    const checkOutMinutes = getMinutes(row.time);
    return row.action === 'Check-out'
      && checkOutMinutes >= (9 * 60)
      && checkOutMinutes < (17 * 60);
  });
  const checkInKeys = new Set(filteredRows
    .filter((row) => row.action === 'Check-in')
    .map((row) => `${row.date}|${normalizePersonName(row.name)}|${row.department}`));
  const missingCheckIns: LateArrival[] = filteredRows
    .filter((row) => row.action === 'Check-out' && !checkInKeys.has(`${row.date}|${normalizePersonName(row.name)}|${row.department}`))
    .map((row) => ({ ...row, missingCheckIn: true }));
  const lateByDepartment = [...new Set(lateArrivals.map((row) => row.department))]
    .sort((left, right) => left.localeCompare(right, 'vi'))
    .map((department) => ({
      department,
      arrivals: lateArrivals.filter((row) => row.department === department),
    }));
  const lateByMember = [...lateArrivals.reduce((totals, row) => {
    const key = normalizePersonName(row.name);
    totals.set(key, (totals.get(key) ?? 0) + (row.lateMinutes ?? 0));
    return totals;
  }, new Map<string, number>())]
    .map(([key, totalMinutes]) => ({ name: memberLabels.get(key) ?? key, totalMinutes }))
    .sort((left, right) => right.totalMinutes - left.totalMinutes);
  const maxLateMinutes = lateByMember[0]?.totalMinutes ?? 1;

  return (
    <main className="page-layout">
      <div className="page-header">
        <div>
          <p className="eyebrow">ATTENDANCE REPORT</p>
          <h1>Báo cáo check in / check out</h1>
          <p className="page-subtitle">Dữ liệu lấy trực tiếp từ Google Sheets, cập nhật mỗi lần tải trang.</p>
        </div>
        <Link href="/" className="primary-btn">Về dashboard</Link>
      </div>

      {error ? <div className="empty-state">{error}</div> : (
        <>
          <AttendanceFilters
            members={members}
            mode={filterMode}
            member={filters.member}
            date={selectedDate}
            from={filters.from}
            to={filters.to}
          />

          <div className="attendance-late-layout">
            <section className="panel late-arrivals-panel">
              <div className="panel-header">
                <div><p className="eyebrow">MỐC CHUẨN 08:30 - 09:00</p><h3>Danh sách đi trễ theo phòng ban</h3></div>
                <span className="status-badge status-pending">{lateArrivals.length} lượt trễ</span>
              </div>
              {lateByDepartment.length === 0 ? <p className="empty-state">Không có lượt đi trễ theo bộ lọc hiện tại.</p> : (
                <div className="late-department-grid">
                  {lateByDepartment.map(({ department, arrivals }) => (
                    <div className="late-department" key={department}>
                      <div className="late-department-heading"><strong>{department}</strong><span>{arrivals.length} lượt</span></div>
                      <div className="late-member-list">
                        {arrivals.map((arrival, index) => (
                          <div className="late-member" key={`${arrival.timestamp}-${arrival.name}-${index}`}>
                            <span>{memberLabels.get(normalizePersonName(arrival.name)) ?? arrival.name}</span>
                            <span><strong>{arrival.time}</strong> <em>trễ {arrival.lateMinutes} phút</em></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel late-minutes-chart-panel">
              <div className="panel-header">
                <div><p className="eyebrow">TỔNG PHÚT</p><h3>Tổng phút đi trễ theo thành viên</h3></div>
                <span className="live-status">Theo bộ lọc hiện tại</span>
              </div>
              {lateByMember.length === 0 ? <p className="empty-state">Không có dữ liệu đi trễ.</p> : (
                <div className="late-minutes-chart">
                  {lateByMember.map(({ name, totalMinutes }) => (
                    <div className="late-minutes-row" key={name}>
                      <div className="late-minutes-meta"><span>{name}</span><strong>{totalMinutes} phút</strong></div>
                      <div className="late-minutes-track"><span style={{ width: `${(totalMinutes / maxLateMinutes) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="panel late-arrivals-panel">
            <div className="panel-header">
              <div><p className="eyebrow">CHECK-IN 09:00 - 17:00</p><h3>Danh sách xin vào trễ theo phòng ban</h3></div>
              <span className="status-badge status-pending">{lateRequestArrivals.length} lượt</span>
            </div>
            {lateRequestArrivals.length === 0 ? <p className="empty-state">Không có lượt xin vào trễ theo bộ lọc hiện tại.</p> : (
              <div className="late-department-grid">
                {[...new Set(lateRequestArrivals.map((row) => row.department))]
                  .sort((left, right) => left.localeCompare(right, 'vi'))
                  .map((department) => {
                    const arrivals = lateRequestArrivals.filter((row) => row.department === department);
                    return <div className="late-department" key={department}>
                      <div className="late-department-heading"><strong>{department}</strong><span>{arrivals.length} lượt</span></div>
                      <div className="late-member-list">
                        {arrivals.map((arrival, index) => <div className="late-member" key={`${arrival.timestamp}-${arrival.name}-${index}`}>
                          <span>{memberLabels.get(normalizePersonName(arrival.name)) ?? arrival.name}</span>
                          <span><strong>{arrival.time}</strong> <em>xin vào trễ</em></span>
                        </div>)}
                      </div>
                    </div>;
                  })}
              </div>
            )}
          </section>

          <section className="panel late-arrivals-panel">
            <div className="panel-header">
              <div><p className="eyebrow">CHECK-OUT 09:00 - 17:00</p><h3>Danh sách xin về sớm theo phòng ban</h3></div>
              <span className="status-badge status-pending">{earlyDepartureRows.length} lượt</span>
            </div>
            {earlyDepartureRows.length === 0 ? <p className="empty-state">Không có lượt xin về sớm theo bộ lọc hiện tại.</p> : (
              <div className="late-department-grid">
                {[...new Set(earlyDepartureRows.map((row) => row.department))]
                  .sort((left, right) => left.localeCompare(right, 'vi'))
                  .map((department) => {
                    const departures = earlyDepartureRows.filter((row) => row.department === department);
                    return <div className="late-department" key={department}>
                      <div className="late-department-heading"><strong>{department}</strong><span>{departures.length} lượt</span></div>
                      <div className="late-member-list">
                        {departures.map((departure, index) => <div className="late-member" key={`${departure.timestamp}-${departure.name}-${index}`}>
                          <span>{memberLabels.get(normalizePersonName(departure.name)) ?? departure.name}</span>
                          <span><strong>{departure.time}</strong> <em>xin về sớm</em></span>
                        </div>)}
                      </div>
                    </div>;
                  })}
              </div>
            )}
          </section>

          <div className="stats-row">
            <div className="metric-card"><span>Tổng lượt check-in</span><strong>{checkIns}</strong></div>
            <div className="metric-card"><span>Tổng lượt check-out</span><strong>{checkOuts}</strong></div>
            <div className="metric-card"><span>Nhân sự đã ghi nhận</span><strong>{people}</strong></div>
            <div className="metric-card"><span>Chênh lệch lượt</span><strong>{incomplete}</strong></div>
          </div>

          <section className="panel">
            <div className="panel-header">
              <div><p className="eyebrow">LIVE DATA</p><h3>Đối chiếu check-in / check-out</h3></div>
              <span className="live-status">Nguồn: Google Sheets</span>
            </div>
            <div className="table-wrap attendance-pairs-table-wrap">
              <table className="data-table">
                <thead><tr><th>Ngày</th><th>Họ và tên</th><th>Bộ phận</th><th className="attendance-check-in-column">Check-in</th><th className="attendance-check-out-column">Check-out</th></tr></thead>
                <tbody>
                  {completedAttendancePairs.map((row, index) => (
                    <tr key={`${row.date}-${row.name}-${row.department}-${index}`}>
                      <td>{row.date}</td>
                      <td>{row.name}</td>
                      <td>{row.department}</td>
                      <td className="attendance-check-in-column">{row.checkIn ? <span className="status-badge status-connected">{row.checkIn}</span> : <span className="empty-time">Chưa có</span>}</td>
                      <td className="attendance-check-out-column">{row.checkOut ? <span className="status-badge status-pending">{row.checkOut}</span> : <span className="empty-time">Chưa có</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
