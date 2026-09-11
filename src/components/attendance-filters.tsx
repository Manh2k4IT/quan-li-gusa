'use client';

import { useState } from 'react';
import Link from 'next/link';

type AttendanceFiltersProps = {
  members: string[];
  mode: 'date' | 'range';
  member?: string;
  date?: string;
  from?: string;
  to?: string;
};

export default function AttendanceFilters({ members, mode: initialMode, member, date, from, to }: AttendanceFiltersProps) {
  const [mode, setMode] = useState<'date' | 'range'>(initialMode);

  return (
    <form className="attendance-filters" method="get">
      <div className="attendance-filter-mode" role="group" aria-label="Kiểu lọc ngày">
        <span className="attendance-filter-mode-label">Chọn kiểu lọc</span>
        <label className="attendance-radio">
          <input
            type="radio"
            name="mode"
            value="date"
            checked={mode === 'date'}
            onChange={() => setMode('date')}
          />
          Theo ngày
        </label>
        <label className="attendance-radio">
          <input
            type="radio"
            name="mode"
            value="range"
            checked={mode === 'range'}
            onChange={() => setMode('range')}
          />
          Theo khoảng ngày
        </label>
      </div>
      <label>
        Thành viên
        <select name="member" defaultValue={member ?? ''}>
          <option value="">Tất cả thành viên</option>
          {members.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      {mode === 'date' ? <label>
        Ngày
        <input type="date" name="date" defaultValue={date ?? ''} />
      </label> : <>
        <label>
          Từ ngày
          <input type="date" name="from" defaultValue={from ?? ''} />
        </label>
        <label>
          Đến ngày
          <input type="date" name="to" defaultValue={to ?? ''} />
        </label>
      </>}
      <button type="submit" className="primary-btn">Lọc dữ liệu</button>
      <Link href="/attendance" className="ghost-btn">Xóa lọc</Link>
    </form>
  );
}
