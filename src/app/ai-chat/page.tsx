'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';

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

const SUGGESTIONS = [
  'Tóm tắt doanh thu tháng này',
  'Sản phẩm nào bán chạy nhất?',
  'Khách hàng nào cần chăm sóc lại?',
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
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const list = messagesRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Grow the composer with its content, up to the CSS max-height.
  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [input]);

  function startNewChat() {
    if (loading) return;
    setMessages([{ from: 'AI', text: 'Xin chào! Tôi có thể giúp gì cho bạn hôm nay?' }]);
    setInput('');
    inputRef.current?.focus();
  }

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
    <main className="page-layout assistant-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Trò chuyện AI</p>
          <h1>Trợ lý doanh nghiệp</h1>
        </div>
        <Link href="/" className="ghost-btn">Quay lại dashboard</Link>
      </div>

      <div className="assistant-layout">
        <aside className="assistant-threads">
          <button type="button" className="assistant-new-chat" onClick={startNewChat}>
            <Icon name="plus" size={16} />
            Cuộc trò chuyện mới
          </button>
          <p className="assistant-threads-title">Gần đây</p>
          <div className="assistant-thread-list">
            {threads.map((thread) => (
              <article key={thread.title} className="assistant-thread">
                <div className="assistant-thread-head">
                  <h4>{thread.title}</h4>
                  <small>{thread.time}</small>
                </div>
                <p>{thread.summary}</p>
              </article>
            ))}
          </div>
        </aside>

        <section className="assistant-chat">
          <header className="assistant-chat-header">
            <span className="assistant-avatar ai"><Icon name="sparkles" size={18} /></span>
            <div>
              <h3>Trợ lý AI</h3>
              <small><span className="assistant-online-dot" />Trực tuyến · Phân tích dữ liệu ERP</small>
            </div>
          </header>

          <div className="assistant-messages" ref={messagesRef}>
            {messages.map((message, index) => {
              const fromAi = message.from === 'AI';
              return (
                <div key={`${message.from}-${index}`} className={`assistant-message ${fromAi ? 'ai' : 'human'} ${message.kind ?? ''}`}>
                  {fromAi ? <span className="assistant-avatar ai"><Icon name="sparkles" size={15} /></span> : null}
                  <div className="assistant-bubble">
                    {message.kind === 'loading' ? <span className="assistant-typing" aria-label="Đang trả lời"><i /><i /><i /></span> : renderMessage(message.text)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="assistant-composer">
            <div className="assistant-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}>
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="assistant-input">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends; Shift+Enter inserts a newline.
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Nhập câu hỏi cho trợ lý AI..."
              />
              <button type="button" className="assistant-send" onClick={handleSend} disabled={loading || !input.trim()} aria-label="Gửi">
                <Icon name="send" size={18} />
              </button>
            </div>
            <small className="assistant-hint">Enter để gửi · Shift + Enter để xuống dòng</small>
          </div>
        </section>
      </div>
    </main>
  );
}
