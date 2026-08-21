'use client';

import Link from 'next/link';
import { useState } from 'react';

const threads = [
  {
    title: 'Tối ưu chiến lược miền Nam',
    summary: 'Khuyến nghị tăng ngân sách 12% cho ad set premium và ưu tiên chuyển đổi mobile.',
    time: '12 phút trước',
  },
  {
    title: 'Review tồn kho Tech SKU',
    summary: 'Cảnh báo 3 sản phẩm đang gần ngưỡng đặt hàng lại, nên xử lý trong 24 giờ.',
    time: '1 giờ trước',
  },
  {
    title: 'Phân tích pipeline Q4',
    summary: 'Tỷ lệ chốt deal từ lead mới đang cao hơn 1.8x so với Q3.',
    time: 'Hôm qua',
  },
];

const initialMessages = [
  { from: 'AI', text: 'Tôi đã phát hiện 3 nhóm khách hàng B2B có xu hướng chuyển đổi cao hơn trong 14 ngày qua.' },
  { from: 'Manager', text: 'Cho tôi biết nhóm nào nên ưu tiên nhất và ngân sách cần phân bổ bao nhiêu?' },
  { from: 'AI', text: 'Nhóm SaaS enterprise và manufacturing nên ưu tiên nhất; đề nghị tăng 15% ngân sách cho ad set này.' },
];

function renderMessage(text: string) {
  return text.split('\n').map((line, index) => {
    const trimmedLine = line.trim();
    const isBullet = /^[-*]\s+/.test(trimmedLine);
    const content = isBullet ? trimmedLine.replace(/^[-*]\s+/, '') : trimmedLine.replace(/^#{1,3}\s+/, '');
    const parts = content.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g).filter(Boolean);
    const formattedContent = parts.map((part, partIndex) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={partIndex}>{part.slice(2, -2)}</strong>;
      }

      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={partIndex}>{part.slice(1, -1)}</em>;
      }

      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={partIndex}>{part.slice(1, -1)}</code>;
      }

      return <span key={partIndex}>{part}</span>;
    });

    if (!trimmedLine) return <div key={index} className="chat-message-break" />;
    if (isBullet) return <div key={index} className="chat-message-list-item">{formattedContent}</div>;
    if (/^#{1,3}\s+/.test(trimmedLine)) return <div key={index} className="chat-message-heading">{formattedContent}</div>;
    return <div key={index}>{formattedContent}</div>;
  });
}

export default function AIChatPage() {
  const [messages, setMessages] = useState<Array<{ from: string; text: string; kind?: 'error' | 'loading' }>>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const trimmed = input.trim();

    if (!trimmed || loading) {
      return;
    }

    const userMessage = { from: 'Manager', text: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setLoading(true);
    setMessages((current) => [...current, { from: 'AI', text: 'Đang phân tích dữ liệu và chuẩn bị câu trả lời...', kind: 'loading' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to generate AI response');
      }

      setMessages((current) => [...current.filter((item) => item.kind !== 'loading'), { from: 'AI', text: payload.reply }]);
    } catch (error) {
      setMessages((current) => [
        ...current.filter((item) => item.kind !== 'loading'),
        { from: 'AI', text: error instanceof Error ? error.message : 'AI đang mất kết nối. Vui lòng thử lại.', kind: 'error' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-layout">
      <div className="page-header">
        <div>
          <p className="eyebrow">AI Chat</p>
          <h1>Trợ lý doanh nghiệp</h1>
        </div>
        <Link href="/" className="primary-btn">Quay lại dashboard</Link>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Conversations</p>
            <h3>Cuộc trò chuyện gần đây</h3>
          </div>
        </div>

        <div className="chat-thread-list">
          {threads.map((thread) => (
            <article key={thread.title} className="chat-thread-item">
              <div>
                <h4>{thread.title}</h4>
                <p>{thread.summary}</p>
              </div>
              <small>{thread.time}</small>
            </article>
          ))}
        </div>
      </div>

      <div className="panel ai-panel large-ai-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Live chat</p>
            <h3>Trợ lý AI</h3>
          </div>
          <span className="badge success">Online</span>
        </div>

        <div className="chat-session">
          {messages.map((message, index) => (
            <div key={`${message.from}-${index}`} className={`chat-bubble ${message.from === 'AI' ? 'ai' : 'human'} ${message.kind ?? ''}`}>
              <div className="chat-avatar">{message.from === 'AI' ? 'AI' : 'U'}</div>
              <div className="chat-message-text">{renderMessage(message.text)}</div>
            </div>
          ))}
        </div>

        <div className="chat-input-row">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleSend();
              }
            }}
            placeholder="Nhập câu hỏi cho trợ lý AI..."
          />
          <button className="primary-btn" onClick={handleSend} disabled={loading}>
            {loading ? 'Đang gửi...' : 'Gửi'}
          </button>
        </div>
      </div>
    </main>
  );
}
