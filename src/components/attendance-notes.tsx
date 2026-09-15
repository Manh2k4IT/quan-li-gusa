'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type AttendanceNote = {
  id: string;
  date: string;
  name: string;
  department: string;
  type: string;
  reason: string;
};

type AttendanceNotesProps = {
  notes: AttendanceNote[];
  members: string[];
  departments: string[];
  defaultDate: string;
  defaultFrom?: string;
  defaultTo?: string;
};

export default function AttendanceNotes({ notes, members, departments, defaultDate, defaultFrom, defaultTo }: AttendanceNotesProps) {
  const router = useRouter();
  const [name, setName] = useState(members[0] ?? '');
  const [department, setDepartment] = useState(departments[0] ?? '');
  const [type, setType] = useState('Đi trễ');
  const [date, setDate] = useState(defaultDate);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function saveNote() {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/attendance-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, name, department, type, reason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Không thể lưu ghi chú.');
      setReason('');
      setMessage('Đã lưu ghi chú.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể lưu ghi chú.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(id: string) {
    if (!window.confirm('Bạn có chắc muốn xóa ghi chú này?')) return;
    await fetch('/api/attendance-notes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    router.refresh();
  }

  return (
    <section className="panel attendance-notes-panel">
      <div className="panel-header">
        <div><p className="eyebrow">GHI CHÚ CHẤM CÔNG</p><h3>Xin nghỉ, đi trễ, về sớm</h3></div>
        <span className="status-badge status-pending">{notes.length} ghi chú</span>
      </div>
      <div className="attendance-note-form">
        <label>Ngày<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Nhân sự<input list="attendance-member-suggestions" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nhập tên nhân sự..." /><datalist id="attendance-member-suggestions">{members.map((member) => <option key={member} value={member} />)}</datalist></label>
        <label>Phòng ban<select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">Chọn phòng ban</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>Loại<select value={type} onChange={(event) => setType(event.target.value)}><option>Nghỉ phép</option><option>Đi trễ</option><option>Về sớm</option></select></label>
        <label className="attendance-note-reason">Lý do<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Nhập lý do cụ thể..." /></label>
        <button type="button" className="primary-btn" onClick={saveNote} disabled={saving || !name || !reason.trim()}>{saving ? 'Đang lưu...' : 'Lưu ghi chú'}</button>
      </div>
      {message && <p className="attendance-note-message">{message}</p>}
      {notes.length ? <div className="attendance-notes-list">{notes.map((note) => <div className="attendance-note-row" key={note.id}>
        <div><strong>{note.name}</strong><small>{note.department} · {note.date}</small></div>
        <span className={`attendance-note-type attendance-note-type-${note.type === 'Nghỉ phép' ? 'leave' : note.type === 'Đi trễ' ? 'late' : 'early'}`}>{note.type}</span>
        <p>{note.reason}</p>
        <button type="button" className="attendance-note-delete" onClick={() => deleteNote(note.id)} aria-label={`Xóa ghi chú của ${note.name}`}>Xóa</button>
      </div>)}</div> : <p className="empty-state">Chưa có ghi chú trong khoảng thời gian đang chọn.</p>}
    </section>
  );
}