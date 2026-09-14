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
    const apiKey = process.env.OPENAI_API_KEY;
    const normalizedPrompt = prompt.toLowerCase();
    const needsMarketData = /thị trường|xu hướng|đối thủ|giá thị trường|mới nhất|hiện nay|ngành thời trang|ngành vải|người tiêu dùng|mạng xã hội|trend|dự báo nhu cầu/.test(normalizedPrompt);
    const needsProductData = /gusa|nội bộ|erp|doanh thu|bán|tồn|kho|đơn|mã|sku|chi nhánh|sản phẩm nào|hàng nào|của chúng ta/.test(normalizedPrompt);

    if (!apiKey) return NextResponse.json({ message: 'Chưa cấu hình OPENAI_API_KEY trên server.' }, { status: 503 });

    if (needsMarketData) {
      const mode = needsProductData ? 'web+erp' : 'web';
      const erpContext = needsProductData ? `\n\nCHI NHÁNH GUSA: ${businessGroup}\nDỮ LIỆU SẢN PHẨM ERP GUSA:\n${JSON.stringify(products)}` : '';
      const webResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_WEB_MODEL || 'gpt-4.1-mini',
          instructions: 'Bạn là chuyên gia chiến lược sản phẩm và marketing của GUSA tại Việt Nam. Trả lời hoàn toàn bằng tiếng Việt. Với dữ liệu thị trường, phải dùng web search và nêu rõ nguồn. Với dữ liệu ERP, chỉ kết luận từ số liệu được cung cấp. Phân biệt rõ dữ liệu thị trường và dữ liệu nội bộ, không trộn nguồn hoặc bịa số.',
          input: `${prompt}${erpContext}\n\nNgày phân tích: ${new Date().toISOString().slice(0, 10)}. Ưu tiên nguồn mới, đáng tin cậy và liên quan thị trường Việt Nam.`,
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

      return NextResponse.json({ reply: getResponseText(webPayload?.output) || 'AI chưa đưa ra phân tích.', provider: 'openai-web', mode, sources: getResponseSources(webPayload?.output) });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Bạn là trợ lý phân tích sản phẩm của GUSA. Trả lời hoàn toàn bằng tiếng Việt. Với lời chào hoặc hội thoại thông thường, hãy trả lời tự nhiên, ngắn gọn và không tự ý phân tích dữ liệu. Chỉ phân tích số liệu khi người dùng yêu cầu; khi phân tích phải dựa đúng dữ liệu ERP được cung cấp và không bịa số.' },
          { role: 'user', content: needsProductData ? `${prompt}\n\nCHI NHÁNH: ${businessGroup}\nDỮ LIỆU SẢN PHẨM ERP:\n${JSON.stringify(products)}` : prompt },
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
    return NextResponse.json({ reply: payload.choices?.[0]?.message?.content?.trim() ?? 'AI chưa đưa ra phân tích.', provider: 'openai', mode: needsProductData ? 'erp' : 'chat', sources: [] });
  } catch (error) {
    console.error('Product AI analysis error:', error);
    return NextResponse.json({ message: 'Không thể phân tích sản phẩm lúc này.' }, { status: 500 });
  }
}
