import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getErpProductAnalysis } from '@/lib/erp';

type ProductInput = { sku?: string; name?: string; category?: string; soldQuantity?: number; orderCount?: number; revenue?: number; stock?: number };
type WebCitation = { type?: string; url?: string; title?: string };
type ResponseOutput = {
  type?: string;
  content?: Array<{ type?: string; text?: string; annotations?: WebCitation[] }>;
};

function getResponseText(output: ResponseOutput[] | undefined) {
  return (output ?? []).flatMap((item) => item.content ?? []).filter((content) => content.type === 'output_text').map((content) => content.text ?? '').join('\n').trim();
}

function getResponseSources(output: ResponseOutput[] | undefined) {
  const sources = new Map<string, { title: string; url: string }>();
  for (const item of output ?? []) {
    for (const content of item.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === 'url_citation' && annotation.url) sources.set(annotation.url, { title: annotation.title || annotation.url, url: annotation.url });
      }
    }
  }
  return [...sources.values()];
}

export async function GET() {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const products = await getErpProductAnalysis();
    return NextResponse.json({ products, source: 'ERP' });
  } catch (error) {
    console.error('ERP product analysis error:', error);
    return NextResponse.json({ message: 'Không thể tải dữ liệu sản phẩm từ ERP.' }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const products: ProductInput[] = Array.isArray(body.products) ? body.products.slice(0, 300) : [];
    const prompt = String(body.prompt ?? 'Phân tích hiệu quả sản phẩm và đề xuất hành động bán hàng, tồn kho.').trim();
    const businessGroup = String(body.businessGroup ?? 'nhóm đang chọn').trim();
    const analysisMode = body.analysisMode === 'web+erp' ? 'web+erp' : 'erp';
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) return NextResponse.json({ message: 'Chưa cấu hình OPENAI_API_KEY trên server.' }, { status: 503 });

    if (analysisMode === 'web+erp') {
      const erpContext = `\n\nCHI NHÁNH GUSA: ${businessGroup}\nDỮ LIỆU SẢN PHẨM ERP GUSA:\n${JSON.stringify(products)}`;
      const webResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_WEB_MODEL || 'gpt-4.1-mini',
          instructions: 'Bạn là chuyên gia chiến lược sản phẩm và marketing của GUSA tại Việt Nam. Trả lời hoàn toàn bằng tiếng Việt. Bắt buộc nghiên cứu nhiều nguồn web độc lập, ưu tiên ít nhất 3 nguồn mới và đáng tin cậy khi có thể. Không trả về một danh sách đường dẫn thay cho câu trả lời. Hãy tổng hợp các nguồn thành nhận định thị trường, đối chiếu với dữ liệu ERP, giải thích cơ hội/rủi ro và đưa ra hành động cụ thể cho GUSA. Phân biệt rõ dữ liệu thị trường và dữ liệu nội bộ, không trộn nguồn hoặc bịa số. Nguồn chỉ dùng để kiểm chứng các kết luận.',
          input: `${prompt}${erpContext}\n\nNgày phân tích: ${new Date().toISOString().slice(0, 10)}. Hãy trả lời theo cấu trúc: Kết luận chính; Tín hiệu thị trường; Đối chiếu dữ liệu GUSA; Chiến lược đề xuất; Việc cần làm ngay.`,
          tools: [{ type: 'web_search', search_context_size: 'medium', user_location: { type: 'approximate', country: 'VN', city: 'Ho Chi Minh City', timezone: 'Asia/Ho_Chi_Minh' } }],
          tool_choice: 'required',
          include: ['web_search_call.action.sources'],
          max_output_tokens: 1400,
        }),
      });

      const webPayload = await webResponse.json().catch(() => null) as { output?: ResponseOutput[]; error?: { code?: string; message?: string } } | null;
      if (!webResponse.ok) {
        console.error('Product web search error:', webResponse.status, webPayload?.error?.code, webPayload?.error?.message);
        return NextResponse.json({ message: `Không thể tìm kiếm thị trường (${webResponse.status}). ${webPayload?.error?.message ?? ''}` }, { status: webResponse.status });
      }

      return NextResponse.json({ reply: getResponseText(webPayload?.output) || 'AI chưa đưa ra phân tích.', provider: 'openai-web', mode: 'web+erp', sources: getResponseSources(webPayload?.output) });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Bạn là trợ lý phân tích sản phẩm nội bộ của GUSA. Trả lời hoàn toàn bằng tiếng Việt và chỉ dựa trên dữ liệu ERP được cung cấp. Không sử dụng hay suy đoán dữ liệu thị trường bên ngoài, không bịa số. Nếu dữ liệu chưa đủ, phải nói rõ.' },
          { role: 'user', content: `${prompt}\n\nCHI NHÁNH GUSA: ${businessGroup}\nDỮ LIỆU SẢN PHẨM ERP GUSA:\n${JSON.stringify(products)}` },
        ],
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
      const errorCode = errorPayload?.error?.code;
      const errorMessage = errorPayload?.error?.message ?? '';
      console.error('Product AI provider error:', response.status, errorCode, errorMessage);
      const message = response.status === 401
        ? 'OPENAI_API_KEY trên server không hợp lệ hoặc đã bị thu hồi. Hãy cập nhật key mới trên Render.'
        : response.status === 429
          ? 'OpenAI đang hết quota hoặc vượt giới hạn tốc độ. Hãy kiểm tra Billing và Limits.'
          : `OpenAI trả lỗi ${response.status}${errorCode ? ` (${errorCode})` : ''}. ${errorMessage}`;
      return NextResponse.json({ message }, { status: response.status });
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return NextResponse.json({ reply: payload.choices?.[0]?.message?.content?.trim() ?? 'AI chưa đưa ra phân tích.', provider: 'openai', mode: 'erp', sources: [] });
  } catch (error) {
    console.error('Product AI analysis error:', error);
    return NextResponse.json({ message: 'Không thể phân tích sản phẩm lúc này.' }, { status: 500 });
  }
}
