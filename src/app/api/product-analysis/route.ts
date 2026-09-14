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

function getBusinessScope(businessGroup: string) {
  const normalized = businessGroup.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
  if (normalized.includes('thoi trang')) {
    return 'Đây là chi nhánh THỜI TRANG MAY MẶC. Chỉ nghiên cứu và đề xuất quần áo, bộ sưu tập, thiết kế, kiểu dáng và sản phẩm thời trang hoàn chỉnh có trong dữ liệu ERP của chi nhánh này.';
  }
  if (normalized.includes('ben thanh')) {
    return 'Đây là chi nhánh BÁN VẢI LINEN BẾN THÀNH. Chỉ nghiên cứu thị trường vải linen theo mét, chất liệu, màu sắc, họa tiết, giá vải, khách may mặc và kênh bán sỉ/lẻ vải. Không đề xuất bán quần áo hoặc sản phẩm may mặc hoàn chỉnh như thể chúng là hàng của chi nhánh.';
  }
  return 'Đây là chi nhánh BÁN VẢI LINEN QUẬN 4. Chỉ nghiên cứu thị trường vải linen theo mét, chất liệu, màu sắc, họa tiết, giá vải, khách may mặc và kênh bán sỉ/lẻ vải. Không đề xuất bán quần áo hoặc sản phẩm may mặc hoàn chỉnh như thể chúng là hàng của chi nhánh.';
}

function buildProductErpSummary(products: ProductInput[]) {
  const rows = products.map((product) => ({
    sku: String(product.sku ?? ''),
    name: String(product.name ?? product.sku ?? 'Chưa đặt tên'),
    category: String(product.category ?? 'Chưa phân loại'),
    soldQuantity: Number(product.soldQuantity ?? 0),
    orderCount: Number(product.orderCount ?? 0),
    revenue: Number(product.revenue ?? 0),
    stock: Number(product.stock ?? 0),
  }));
  const totalRevenue = rows.reduce((sum, product) => sum + product.revenue, 0);
  const totalSoldQuantity = rows.reduce((sum, product) => sum + product.soldQuantity, 0);
  const totalOrders = rows.reduce((sum, product) => sum + product.orderCount, 0);
  return {
    productCount: rows.length,
    totalRevenue,
    totalSoldQuantity,
    totalOrders,
    productsWithSales: rows.filter((product) => product.soldQuantity > 0 || product.revenue > 0).length,
    productsWithoutSales: rows.filter((product) => product.soldQuantity <= 0 && product.revenue <= 0).length,
    productsOutOfStockWithSales: rows.filter((product) => product.soldQuantity > 0 && product.stock <= 0).length,
    totalStock: rows.reduce((sum, product) => sum + product.stock, 0),
    topRevenue: [...rows].sort((first, second) => second.revenue - first.revenue).slice(0, 10),
    topQuantity: [...rows].sort((first, second) => second.soldQuantity - first.soldQuantity).slice(0, 10),
    highestStock: rows.filter((product) => product.stock > 0).sort((first, second) => second.stock - first.stock).slice(0, 30),
    slowMovingStock: rows.filter((product) => product.stock > 0).sort((first, second) => first.soldQuantity - second.soldQuantity || second.stock - first.stock).slice(0, 10),
    stockRisk: rows.filter((product) => product.soldQuantity > 0 && product.stock <= 0).sort((first, second) => second.soldQuantity - first.soldQuantity).slice(0, 10),
  };
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
    const businessScope = getBusinessScope(businessGroup);

    if (!apiKey) return NextResponse.json({ message: 'Chưa cấu hình OPENAI_API_KEY trên server.' }, { status: 503 });

    if (analysisMode === 'web+erp') {
      const erpSummary = buildProductErpSummary(products);
      const erpContext = `\n\nCHI NHÁNH GUSA: ${businessGroup}\nTÓM TẮT KPI ERP ĐÃ TÍNH:\n${JSON.stringify(erpSummary)}\nDỮ LIỆU SẢN PHẨM ERP CHI TIẾT:\n${JSON.stringify(products)}`;
      const webResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_WEB_MODEL || 'gpt-4.1-mini',
          instructions: `Bạn là chuyên gia chiến lược ngành thời trang và vải linen của GUSA tại Việt Nam. ${businessScope} ERP là nguồn sự thật; web chỉ cung cấp bối cảnh. Không được lấy sản phẩm của chi nhánh khác hoặc sản phẩm không có trong payload làm đề xuất cho chi nhánh đang phân tích. Bắt buộc bắt đầu từ yêu cầu cụ thể và dữ liệu ERP rồi mới mở rộng bằng nhiều nguồn web. Khi người dùng hỏi tồn kho, bán chậm hoặc mã tồn, phần đầu bắt buộc là bảng SKU gồm mã, tên, tồn kho, đã bán, số đơn, doanh thu và lý do ưu tiên. Không được viện dẫn đánh giá khách hàng, chiến dịch cũ, giá bán lẻ hoặc thuộc tính không có trong ERP. Mỗi chiến lược phải nêu mã sản phẩm thuộc đúng chi nhánh, số liệu ERP, tín hiệu thị trường, hành động và KPI. Không đưa lời khuyên chung chung, không bịa số.`,
          input: `${prompt}${erpContext}\n\nPHẠM VI KINH DOANH BẮT BUỘC: ${businessScope}\nNgày phân tích: ${new Date().toISOString().slice(0, 10)}. Nếu hỏi tồn kho/bán chậm, trả lời theo cấu trúc: 1) Bảng mã tồn cần xử lý; 2) Chẩn đoán từng mã/nhóm mã từ ERP; 3) Tín hiệu thị trường có nguồn đúng phạm vi chi nhánh; 4) Chiến lược cụ thể cho từng mã/nhóm mã; 5) Kế hoạch 7/30/60/90 ngày và KPI. Nếu là câu hỏi khác, vẫn bắt đầu từ mã và số liệu ERP liên quan trước khi mở rộng sang thị trường.`,
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
          { role: 'system', content: `Bạn là trợ lý phân tích sản phẩm nội bộ của GUSA. ${businessScope} Trả lời hoàn toàn bằng tiếng Việt và chỉ dựa trên dữ liệu ERP được cung cấp. Không lấy sản phẩm chi nhánh khác, không sử dụng hay suy đoán dữ liệu thị trường bên ngoài, không bịa số. Nếu dữ liệu chưa đủ, phải nói rõ.` },
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
