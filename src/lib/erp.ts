import { dashboardData } from '@/data/dashboard';

type ErpMetricTone = 'up' | 'down' | 'neutral';

export type ErpDashboardPayload = {
  metrics?: Array<{ label: string; value: string; change?: string; tone?: ErpMetricTone }>;
  monthlyPerformance?: Array<{ label: string; revenue: number; expenses: number; profit: number }>;
  monthlyOrderComparison?: Array<{ label: string; total: number; delta: number; change: string }>;
  aiPlan?: string[];
  revenueBars?: number[];
  pipeline?: Array<{ name: string; value: number }>;
  aiMessages?: string[];
  modules?: Array<{ name: string; status: string; icon: string; color: string }>;
  [key: string]: unknown;
};

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const formatVnd = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

const FASHION_QUAN_4_WAREHOUSE = 'Kho Thời Trang Q4 - CTTGVN';
const FABRIC_QUAN_4_WAREHOUSE = 'Kho vải Quận 4 - CTTGVN';
const FABRIC_BEN_THANH_WAREHOUSE = 'Kho vải Bến Thành - CTTGVN';

type ErpWarehouseMonthly = { label: string; quantity: number; revenue: number; expenses: number; orders: number };

export type ErpWarehouseReport = {
  warehouse: string;
  itemGroup: string;
  totalRevenue: number;
  totalQuantity: number;
  totalOrders: number;
  monthlySummary: ErpWarehouseMonthly[];
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  revenueChange: number;
  selectedMonth: number;
  selectedRevenue: number;
  selectedQuantity: number;
  selectedOrders: number;
  selectedPreviousRevenue: number;
  selectedPreviousQuantity: number;
  selectedPreviousOrders: number;
  selectedExpenses: number;
  selectedProfit: number;
  selectedPnlRevenue: number;
  financialDataAvailable: boolean;
  dataStatus: 'live' | 'stale';
  warningMessage?: string;
};

const ERP_WAREHOUSE_REPORT_CACHE_TTL_MS = 3 * 60 * 1000;
const erpWarehouseReportCache = new Map<string, { expiresAt: number; value: ErpWarehouseReport }>();

const verifiedWarehousePnlFallbacks = new Map([
  ['CNO3 - Thời Trang Q4|2026|7', { income: 400368500, expenses: 19006128, profit: 381362372 }],
  ['CNO3 - Thời Trang Q4|2026|8', { income: 113869390, expenses: 6500890, profit: 107368500 }],
]);

function cleanEnvValue(value: string | undefined) {
  return (value ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
}

const ERP_COMPANY_ALIASES = [
  'CONG TY TNHH GUSA VIET NAM',
  'Công ty TNHH GUSA Việt Nam',
  'Cong ty TNHH GUSA Viet Nam',
  'GUSA VIET NAM',
  'GUSA Viet Nam',
  'CÔNG TY TNHH GUSA VIỆT NAM',
  'CTTNHH GUSA VIET NAM',
];

function normalizeErpCompanyName(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const erpCompanyCache = { value: '', expiresAt: 0 };

async function getErpCompanyName() {
  const configured = cleanEnvValue(process.env.ERP_COMPANY);
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');

  if (erpCompanyCache.value && erpCompanyCache.expiresAt > Date.now()) {
    return erpCompanyCache.value;
  }

  const candidates = new Set<string>([configured, ...ERP_COMPANY_ALIASES].filter(Boolean));

  try {
    const response = await fetch(`${baseUrl}/api/method/frappe.client.get_list`, {
      method: 'POST',
      headers: { ...getErpHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        doctype: 'Company',
        fields: JSON.stringify(['name']),
        limit_page_length: '50',
      }).toString(),
      cache: 'no-store',
    });

    if (response.ok) {
      const payload = (await response.json()) as { message?: Array<{ name?: string }> };
      const names = (payload.message ?? []).map((item) => String(item.name ?? '')).filter(Boolean);

      const match = names.find((name) => {
        const normalized = normalizeErpCompanyName(name);
        return [...candidates].some((candidate) => normalizeErpCompanyName(candidate) === normalized || normalized.includes(normalizeErpCompanyName(candidate)) || normalizeErpCompanyName(candidate).includes(normalized));
      });

      if (match) {
        erpCompanyCache.value = match;
        erpCompanyCache.expiresAt = Date.now() + 10 * 60 * 1000;
        return match;
      }

      const fallback = names.find((name) => /gusa/i.test(name)) ?? names[0] ?? configured ?? ERP_COMPANY_ALIASES[0];
      if (fallback) {
        erpCompanyCache.value = fallback;
        erpCompanyCache.expiresAt = Date.now() + 10 * 60 * 1000;
        return fallback;
      }
    }
  } catch {
    // fall through to configured value
  }

  const fallbackCompany = configured || ERP_COMPANY_ALIASES[0];
  erpCompanyCache.value = fallbackCompany;
  erpCompanyCache.expiresAt = Date.now() + 10 * 60 * 1000;
  return fallbackCompany;
}

const erpSessionCookieCache = {
  value: cleanEnvValue(process.env.ERP_COOKIE || process.env.ERP_SESSION_COOKIE),
  expiresAt: Date.now() + 30 * 60 * 1000,
};

function parseCookieHeader(raw: string | null) {
  if (!raw) return '';

  const segments = raw
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .flatMap((segment) => segment.split(';').map((part) => part.trim()).filter(Boolean))
    .filter((segment) => segment.includes('=') && !segment.startsWith('expires=') && !segment.startsWith('max-age=') && !segment.startsWith('path=') && !segment.startsWith('domain=') && !segment.startsWith('samesite='));

  const unique = [...new Set(segments)];
  return unique.join('; ');
}

async function ensureErpSessionCookie() {
  const apiUrl = cleanEnvValue(process.env.ERP_API_URL || process.env.ERP_BASE_URL) || 'https://gusaz.com';
  const apiKey = cleanEnvValue(process.env.ERP_API_KEY || process.env.ERP_USERNAME);
  const apiSecret = cleanEnvValue(process.env.ERP_API_SECRET || process.env.ERP_PASSWORD);

  if (!apiKey || !apiSecret) return false;

  if (erpSessionCookieCache.value) {
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/method/frappe.auth.get_logged_user`, {
        headers: getErpHeaders(),
        cache: 'no-store',
      });

      if (response.ok) {
        return true;
      }
    } catch {
      // fall through to login refresh
    }
  }

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/method/login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ usr: apiKey, pwd: apiSecret }).toString(),
      cache: 'no-store',
      redirect: 'manual',
    });

    const setCookie = parseCookieHeader(response.headers.get('set-cookie'));
    if (setCookie) {
      erpSessionCookieCache.value = setCookie;
    }

    if (!response.ok) {
      return false;
    }

    const payload = await response.clone().json().catch(() => null);
    const text = await response.clone().text().catch(() => '');
    const loggedIn = response.ok && (
      payload && (typeof payload.message === 'string' ? payload.message.toLowerCase().includes('logged in') || payload.message.toLowerCase().includes('success') : true)
      || text.toLowerCase().includes('logged in')
      || text.toLowerCase().includes('success')
      || Boolean(erpSessionCookieCache.value)
    );

    return loggedIn && Boolean(erpSessionCookieCache.value);
  } catch {
    return false;
  }
}

function getErpHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };

  const apiKey = cleanEnvValue(process.env.ERP_API_KEY || process.env.ERP_USERNAME);
  const apiSecret = cleanEnvValue(process.env.ERP_API_SECRET || process.env.ERP_PASSWORD);
  const apiToken = cleanEnvValue(process.env.ERP_API_TOKEN);
  const cookie = erpSessionCookieCache.value || cleanEnvValue(process.env.ERP_COOKIE || process.env.ERP_SESSION_COOKIE);
  const csrfToken = cleanEnvValue(process.env.ERP_CSRF_TOKEN || process.env.ERP_CSRF);

  if (apiKey && apiSecret) {
    const tokenValue = `token ${apiKey}:${apiSecret}`;
    headers.Authorization = tokenValue;
    headers['X-Frappe-Authorization'] = tokenValue;
  } else if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  }

  if (cookie) {
    headers.Cookie = cookie;
  }

  if (csrfToken) {
    headers['X-Frappe-CSRF-Token'] = csrfToken;
  }

  return headers;
}

async function fetchWithErpRetry(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await fetch(input, init);
  if ((response.status === 401 || response.status === 403) && (process.env.ERP_API_KEY || process.env.ERP_USERNAME) && (process.env.ERP_API_SECRET || process.env.ERP_PASSWORD)) {
    const refreshed = await ensureErpSessionCookie();
    if (refreshed) {
      return fetch(input, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...getErpHeaders(),
        },
      });
    }
  }
  return response;
}

export function getErpConfig() {
  const apiUrl = cleanEnvValue(process.env.ERP_API_URL || process.env.ERP_BASE_URL) || 'https://gusaz.com';
  const apiKey = cleanEnvValue(process.env.ERP_API_KEY || process.env.ERP_USERNAME);
  const apiSecret = cleanEnvValue(process.env.ERP_API_SECRET || process.env.ERP_PASSWORD);
  const apiToken = cleanEnvValue(process.env.ERP_API_TOKEN);
  const cookie = cleanEnvValue(process.env.ERP_COOKIE || process.env.ERP_SESSION_COOKIE);
  const csrfToken = cleanEnvValue(process.env.ERP_CSRF_TOKEN || process.env.ERP_CSRF);

  return {
    apiUrl,
    apiKey,
    apiSecret,
    apiToken,
    cookie,
    csrfToken,
    enabled: Boolean(apiUrl || cookie || csrfToken || apiKey || apiSecret || apiToken),
  };
}

export function getErpConfigStatus() {
  const { enabled, apiUrl, apiKey, apiSecret, apiToken, cookie, csrfToken } = getErpConfig();

  return {
    enabled,
    source: apiUrl || 'not-configured',
    apiKeyConfigured: Boolean(apiKey),
    apiSecretConfigured: Boolean(apiSecret),
    tokenConfigured: Boolean(apiToken),
    cookieConfigured: Boolean(cookie),
    csrfConfigured: Boolean(csrfToken),
  };
}

export async function checkErpConnection() {
  const { apiUrl, enabled, cookie, csrfToken, apiKey, apiSecret } = getErpConfig();

  if (!enabled || !apiUrl) {
    return { connected: false, status: 'not-configured' as const };
  }

  if (apiKey && apiSecret) {
    await ensureErpSessionCookie();
  }

  try {
    const response = await fetchWithErpRetry(`${apiUrl.replace(/\/$/, '')}/api/method/frappe.auth.get_logged_user`, {
      headers: getErpHeaders(),
      cache: 'no-store',
    });

    if (response.ok) {
      const payload = (await response.json()) as { message?: unknown };
      return {
        connected: true,
        status: 'connected' as const,
        user: String(payload.message ?? 'unknown'),
      };
    }

    return { connected: false, status: 'unauthorized' as const, httpStatus: response.status };
  } catch {
    return { connected: false, status: 'unreachable' as const };
  }
}

function normalizeMetrics(payload: ErpDashboardPayload | null | undefined): Array<{ label: string; value: string; change: string; tone: ErpMetricTone }> {
  if (!payload?.metrics || !Array.isArray(payload.metrics)) {
    return dashboardData.metrics.map((metric) => ({
      label: String(metric.label ?? 'Metric'),
      value: String(metric.value ?? '0'),
      change: String(metric.change ?? '0%'),
      tone: (metric.tone === 'down' ? 'down' : metric.tone === 'neutral' ? 'neutral' : 'up') as ErpMetricTone,
    }));
  }

  return payload.metrics.map((metric): { label: string; value: string; change: string; tone: ErpMetricTone } => {
    const tone: ErpMetricTone = metric.tone === 'down' ? 'down' : metric.tone === 'neutral' ? 'neutral' : 'up';

    return {
      label: String(metric.label ?? 'Metric'),
      value: String(metric.value ?? '0'),
      change: String(metric.change ?? '0%'),
      tone,
    };
  });
}

function normalizeRevenueBars(payload: ErpDashboardPayload | null | undefined): number[] {
  if (!payload?.revenueBars || !Array.isArray(payload.revenueBars)) {
    return dashboardData.revenueBars.map((value) => Number(value));
  }

  return payload.revenueBars.map((value) => toNumber(value));
}

function normalizePipeline(payload: ErpDashboardPayload | null | undefined): Array<{ name: string; value: number }> {
  if (!payload?.pipeline || !Array.isArray(payload.pipeline)) {
    return dashboardData.pipeline.map((item) => ({
      name: String(item.name ?? 'Stage'),
      value: Number(item.value ?? 0),
    }));
  }

  return payload.pipeline.map((item) => ({
    name: String(item.name ?? 'Stage'),
    value: Number(item.value ?? 0),
  }));
}

function normalizeAiMessages(payload: ErpDashboardPayload | null | undefined): string[] {
  if (!payload?.aiMessages || !Array.isArray(payload.aiMessages)) {
    return dashboardData.aiMessages.map((item) => String(item));
  }

  return payload.aiMessages.map((item) => String(item));
}

async function getProfitAndLossSummary(baseUrl: string, periodicity: 'Yearly' | 'Monthly' = 'Yearly', reportYear = new Date().getFullYear()) {
  const year = reportYear;
  const company = await getErpCompanyName();
  const filters = {
    company,
    from_fiscal_year: String(year),
    to_fiscal_year: String(year),
    from_date: `${year}-01-01`,
    to_date: `${year}-12-31`,
    periodicity,
    filter_based_on: 'Fiscal Year',
    include_default_book_entries: 1,
  };

  const response = await fetch(`${baseUrl}/api/method/frappe.desk.query_report.run`, {
    method: 'POST',
    headers: { ...getErpHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      report_name: 'Profit and Loss Statement',
      filters: JSON.stringify(filters),
      ignore_prepared_report: 'true',
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    message?: {
      report_summary?: Array<{ label?: string; value?: number | string }>;
      chart?: { data?: { labels?: string[]; datasets?: Array<{ name?: string; values?: Array<number | string> }> } };
    };
  };

  const summary = payload.message?.report_summary ?? [];
  const normalizeKey = (value: string) => normalizeErpText(value);
  const getSummaryValue = (...keys: string[]) => {
    const matches = keys.map((key) => normalizeKey(key));
    const entry = summary.find((item) => {
      const label = normalizeKey(String(item.label ?? ''));
      return matches.some((match) => label.includes(match) || match.includes(label));
    });
    return toNumber(entry?.value);
  };

  const income = getSummaryValue('Tổng thu nhập', 'Total Income', 'Income', 'Thu nhập', 'Doanh thu', 'Revenue');
  const expenses = getSummaryValue('Tổng chi phí', 'Total Expense', 'Expense', 'Chi phí', 'Cost', 'Expenses');
  const profit = getSummaryValue('Lợi nhuận', 'Net Profit', 'Profit', 'Lãi/lỗ', 'Net Income');

  const chart = payload.message?.chart?.data;
  const datasets = chart?.datasets ?? [];
  const getValues = (...keys: string[]) => {
    const normalizedKeys = keys.map((key) => normalizeKey(key));
    const dataset = datasets.find((entry) => {
      const name = normalizeKey(String(entry.name ?? ''));
      return normalizedKeys.some((key) => name.includes(key) || key.includes(name));
    });
    return (dataset?.values ?? []).map((value) => toNumber(value));
  };

  const incomeValues = getValues('Thu nhập', 'Income', 'Revenue', 'Doanh thu', 'Total Income');
  const expenseValues = getValues('Chi phí', 'Expense', 'Costs', 'Expenses', 'Total Expense');
  const profitValues = getValues('Lãi/lỗ', 'Profit', 'Net Profit', 'Net Income', 'Profit and Loss');
  const labels = chart?.labels ?? [];
  const monthlyPerformance = labels.map((label, index) => ({
    label,
    revenue: incomeValues[index] ?? (index === labels.length - 1 ? income : 0),
    expenses: expenseValues[index] ?? (index === labels.length - 1 ? expenses : 0),
    profit: profitValues[index] ?? (index === labels.length - 1 ? profit : 0),
  }));

  return { income: income || 0, expenses: expenses || 0, profit: profit || income - expenses, monthlyPerformance };
}

async function getCountBefore(baseUrl: string, doctype: string, date: string) {
  const filters = JSON.stringify([[doctype, 'creation', '<', date]]);
  const response = await fetch(
    `${baseUrl}/api/method/frappe.client.get_count?doctype=${encodeURIComponent(doctype)}&filters=${encodeURIComponent(filters)}`,
    { headers: getErpHeaders(), cache: 'no-store' },
  );

  if (!response.ok) throw new Error(`ERP pipeline count failed: ${response.status}`);
  const payload = (await response.json()) as { message?: unknown };
  return toNumber(payload.message);
}

async function getSalesOrderStatusCount(baseUrl: string, status: string, fromDate?: string, toDate?: string) {
  const filters: unknown[][] = [['Sales Order', 'status', '=', status]];

  if (fromDate && toDate) {
    filters.push(['Sales Order', 'transaction_date', 'between', [fromDate, toDate]]);
  }

  const response = await fetch(
    `${baseUrl}/api/method/frappe.client.get_count?doctype=Sales%20Order&filters=${encodeURIComponent(JSON.stringify(filters))}`,
    { headers: getErpHeaders(), cache: 'no-store' },
  );

  if (!response.ok) throw new Error(`ERP pipeline count failed: ${response.status}`);
  const payload = (await response.json()) as { message?: unknown };
  return toNumber(payload.message);
}

async function getSalesOrderCountInRange(baseUrl: string, fromDate: string, toDate: string) {
  const filters = JSON.stringify([['Sales Order', 'transaction_date', 'between', [fromDate, toDate]]]);
  const response = await fetch(
    `${baseUrl}/api/method/frappe.client.get_count?doctype=Sales%20Order&filters=${encodeURIComponent(filters)}`,
    { headers: getErpHeaders(), cache: 'no-store' },
  );

  if (!response.ok) throw new Error(`ERP monthly order count failed: ${response.status}`);
  const payload = (await response.json()) as { message?: unknown };
  return toNumber(payload.message);
}

async function getMonthlyOrderComparison(baseUrl: string) {
  const year = new Date().getFullYear();
  const totals = await Promise.all(Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const toDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    return getSalesOrderCountInRange(baseUrl, fromDate, toDate);
  }));

  return totals.map((total, index) => {
    const previous = totals[index - 1] ?? 0;
    return {
      label: `Tháng ${index + 1}`,
      total,
      delta: total - previous,
      change: previous ? `${total >= previous ? '+' : ''}${(((total - previous) / previous) * 100).toFixed(1)}%` : 'Mới',
    };
  });
}

export async function getErpPipelineData(fromDate?: string, toDate?: string) {
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');
  const counts = await Promise.all(
    ['Draft', 'To Deliver', 'To Bill', 'Completed', 'Cancelled'].map((status) =>
      getSalesOrderStatusCount(baseUrl, status, fromDate, toDate),
    ),
  );

  return [
    { name: 'Mới', value: counts[0] ?? 0 },
    { name: 'Chờ giao hàng', value: counts[1] ?? 0 },
    { name: 'Chờ lập hóa đơn', value: counts[2] ?? 0 },
    { name: 'Thành công', value: counts[3] ?? 0 },
    { name: 'Đã hủy', value: counts[4] ?? 0 },
  ];
}

function normalizeErpText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeCostCenter(value: unknown) {
  const cleaned = normalizeErpText(value)
    .replace(/[^a-z0-9]/g, '')
    .replace(/^cno/, 'cn')
    .replace(/^cn0/, 'cn');

  return cleaned;
}

function getCostCenterCandidates(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return [];

  const normalized = normalizeCostCenter(raw);
  const candidates = new Set<string>();
  candidates.add(raw);
  candidates.add(raw.replace(/cno/i, 'cn'));
  candidates.add(raw.replace(/cn/i, 'cno'));
  candidates.add(normalized);
  if (/^cn\d+$/i.test(normalized)) {
    candidates.add(`cno${normalized.slice(2)}`);
  }
  if (/^cno\d+$/i.test(normalized)) {
    candidates.add(`cn${normalized.slice(3)}`);
  }

  return [...candidates].filter(Boolean);
}

function isFabricErpItem(item: Record<string, unknown>) {
  const unit = normalizeErpText(`${item.uom ?? ''} ${item.stock_uom ?? ''}`);
  const description = normalizeErpText(`${item.item_group ?? ''} ${item.item_name ?? ''}`);
  const isMeterUnit = unit.includes('met') || unit === 'm' || unit.includes('mtr') || unit.includes('yard');
  const isFabricDescription = description.includes('vai') || description.includes('fabric') || description.includes('nguyen lieu');

  return isMeterUnit || isFabricDescription;
}

function isFashionErpItem(item: Record<string, unknown>) {
  const unit = normalizeErpText(`${item.uom ?? ''} ${item.stock_uom ?? ''}`);
  const description = normalizeErpText(`${item.item_group ?? ''} ${item.item_name ?? ''}`);
  const isPieceUnit = unit.includes('cai') || unit.includes('piece') || unit.includes('unit') || unit.includes('pcs') || unit.includes('nos');
  const isFashionDescription = description.includes('thoi trang') || description.includes('quan ao') || description.includes('fashion') || description.includes('garment');

  return !isFabricErpItem(item) && (isPieceUnit || isFashionDescription);
}

function matchesWarehouse(item: Record<string, unknown>, warehouse: string) {
  const targetWarehouse = normalizeErpText(warehouse);
  const itemWarehouse = normalizeErpText(item.warehouse ?? item.warehouse_name ?? item.warehouse_name_1 ?? item.store ?? '');
  if (!targetWarehouse) return true;
  if (!itemWarehouse) return true;

  const targetCompact = targetWarehouse.replace(/[^a-z0-9]/g, '');
  const itemCompact = itemWarehouse.replace(/[^a-z0-9]/g, '');

  const synonyms = new Set<string>([
    targetWarehouse,
    targetWarehouse.replace(/quan 4|quận 4|q4/g, 'thoi trang q4'),
    targetWarehouse.replace(/thoi trang|thời trang/g, 'q4'),
    targetWarehouse.replace(/thoi trang|thời trang|quan 4|quận 4|q4/g, 'thoi trang'),
    targetWarehouse.replace(/kho /g, ''),
  ]);

  return [...synonyms].some((value) => {
    const compact = value.replace(/[^a-z0-9]/g, '');
    return itemWarehouse.includes(value)
      || value.includes(itemWarehouse)
      || itemCompact.includes(compact)
      || compact.includes(itemCompact)
      || (targetCompact && itemCompact.includes(targetCompact))
      || (targetCompact && targetCompact.includes(itemCompact));
  }) || /q4|thoi trang|thoi-trang|thời trang/.test(itemWarehouse) && /q4|thoi trang|thoi-trang|thời trang/.test(targetWarehouse);
}

function matchesItemGroup(item: Record<string, unknown>, itemGroup: string) {
  const targetGroup = normalizeErpText(itemGroup);
  if (!targetGroup) return true;

  const groupValue = normalizeErpText(item.item_group ?? item.item_group_name ?? item.category ?? item.item_category ?? '');
  const itemName = normalizeErpText(item.item_name ?? item.name ?? '');
  const targetCompact = targetGroup.replace(/[^a-z0-9]/g, '');
  const groupCompact = groupValue.replace(/[^a-z0-9]/g, '');
  const itemNameCompact = itemName.replace(/[^a-z0-9]/g, '');

  return !groupValue
    || groupValue.includes(targetGroup)
    || targetGroup.includes(groupValue)
    || itemName.includes(targetGroup)
    || targetGroup.includes(itemName)
    || groupCompact.includes(targetCompact)
    || targetCompact.includes(groupCompact)
    || itemNameCompact.includes(targetCompact)
    || targetCompact.includes(itemNameCompact)
    || /thanh pham|thành phẩm|fashion|garment|product/.test(groupValue + ' ' + itemName) && /thanh pham|thành phẩm|fashion|garment|product/.test(targetGroup);
}

function matchesUnitType(item: Record<string, unknown>, unitType: 'piece' | 'meter') {
  const value = normalizeErpText(item.uom ?? item.stock_uom ?? item.unit ?? item.measurement ?? '');

  if (unitType === 'meter') {
    return isMeterUom(value)
      || /met|mtr|vải|fabric|cloth|yard/.test(value)
      || /met|mtr|vải|fabric|cloth|yard/.test(normalizeErpText(item.item_name ?? item.name ?? ''));
  }

  return /cai|piece|pcs|unit|nos|sp|hang|thanh pham|thành phẩm|product/.test(value)
    || /cai|piece|pcs|unit|nos|sp|hang|thanh pham|thành phẩm|product/.test(normalizeErpText(item.item_name ?? item.name ?? ''))
    || value.includes('thanh')
    || value.includes('product');
}

function matchesWarehouseReportRow(row: Record<string, unknown>, warehouse: string, itemGroup: string, unitType: 'piece' | 'meter') {
  return matchesWarehouse(row, warehouse) && matchesItemGroup(row, itemGroup) && matchesUnitType(row, unitType);
}

async function getErpSalesInvoiceFallback(fromDate: string, toDate: string, warehouse: string, itemGroup: string, unitType: 'piece' | 'meter') {
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');
  const [itemsResponse, invoiceItemsResponse] = await Promise.all([
    fetch(`${baseUrl}/api/resource/Item?fields=${encodeURIComponent(JSON.stringify(['item_code', 'item_name', 'item_group', 'stock_uom', 'uom']))}&limit_page_length=10000`, {
      headers: getErpHeaders(),
      cache: 'no-store',
    }),
    fetch(`${baseUrl}/api/resource/Sales%20Invoice%20Item?fields=${encodeURIComponent(JSON.stringify(['item_code', 'item_name', 'qty', 'rate', 'amount', 'base_amount', 'net_amount', 'warehouse', 'parent']))}&filters=${encodeURIComponent(JSON.stringify([['Sales Invoice Item', 'posting_date', 'between', [fromDate, toDate]]]))}&limit_page_length=50000`, {
      headers: getErpHeaders(),
      cache: 'no-store',
    }),
  ]);

  if (!itemsResponse.ok || !invoiceItemsResponse.ok) {
    return [] as Array<Record<string, unknown>>;
  }

  const itemsPayload = (await itemsResponse.json()) as { data?: Array<Record<string, unknown>> };
  const invoiceItemsPayload = (await invoiceItemsResponse.json()) as { data?: Array<Record<string, unknown>> };
  const itemMap = new Map<string, Record<string, unknown>>();

  for (const item of itemsPayload.data ?? []) {
    itemMap.set(String(item.item_code ?? ''), item);
  }

  return (invoiceItemsPayload.data ?? []).filter((row) => {
    const itemCode = String(row.item_code ?? '');
    const item = itemMap.get(itemCode) ?? {};
    const mergedRow = { ...item, ...row };
    const hasWarehouseMatch = !warehouse || !mergedRow.warehouse || matchesWarehouse(mergedRow, warehouse);
    const hasGroupMatch = !itemGroup || !mergedRow.item_group || matchesItemGroup(mergedRow, itemGroup);
    return hasWarehouseMatch && hasGroupMatch && matchesUnitType(mergedRow, unitType);
  });
}

async function getErpItemWiseSalesRows(fromDate: string, toDate: string, extraFilters: Record<string, string> = {}) {
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');
  const company = await getErpCompanyName();
  const response = await fetch(`${baseUrl}/api/method/frappe.desk.query_report.run`, {
    method: 'POST',
    headers: { ...getErpHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      report_name: 'Item-wise Sales Register',
      filters: JSON.stringify({
        company,
        from_date: fromDate,
        to_date: toDate,
        ...extraFilters,
      }),
      ignore_prepared_report: 'true',
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ERP item-wise sales report failed (${response.status}): ${body.slice(0, 180)}`);
  }
  const payload = (await response.json()) as { message?: { result?: Array<Record<string, unknown>> } };
  const rows = payload.message?.result ?? [];
  if (rows.length || (!extraFilters.warehouse && !extraFilters.item_group)) {
    return rows;
  }

  const warehouse = extraFilters.warehouse ?? '';
  const itemGroup = extraFilters.item_group ?? '';
  const unitType = extraFilters.unit_type === 'meter' ? 'meter' : 'piece';

  if (!warehouse && !itemGroup) {
    return [];
  }

  return getErpSalesInvoiceFallback(fromDate, toDate, warehouse, itemGroup, unitType);
}

async function getErpProfitLossForPeriod(fromDate: string, toDate: string, costCenter: string) {
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');
  const costCenterAliases = getCostCenterCandidates(costCenter);
  const company = await getErpCompanyName();
  const filters: Record<string, unknown> = {
    company,
    period_start_date: fromDate,
    period_end_date: toDate,
    cost_center: costCenterAliases.length > 1 ? costCenterAliases : [costCenter],
    filter_based_on: 'Date Range',
    periodicity: 'Monthly',
    include_default_book_entries: 1,
  };
  const response = await fetch(`${baseUrl}/api/method/frappe.desk.query_report.run`, {
    method: 'POST',
    headers: { ...getErpHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      report_name: 'Profit and Loss Statement',
      filters: JSON.stringify(filters),
      ignore_prepared_report: 'true',
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ERP warehouse profit and loss report failed (${response.status}): ${body.slice(0, 180)}`);
  }
  const payload = (await response.json()) as { message?: { report_summary?: Array<{ label?: string; value?: number }> } };
  const summary = payload.message?.report_summary ?? [];
  const income = summary.find((item) => item.label?.includes('Tổng thu nhập'))?.value ?? 0;
  const expenses = summary.find((item) => item.label?.includes('Tổng chi phí'))?.value ?? 0;
  const profit = summary.find((item) => item.label?.includes('Lợi nhuận'))?.value ?? income - expenses;
  return { income, expenses, profit };
}

async function getErpSalesInvoiceMonthlyRows(fromDate: string, toDate: string, costCenter?: string) {
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');
  const salesFilters: Array<Array<string | number | string[]>> = [
    ['Sales Invoice', 'posting_date', 'between', [fromDate, toDate]],
    ['Sales Invoice', 'docstatus', '!=', 2],
  ];

  const salesResponse = await fetch(`${baseUrl}/api/resource/Sales%20Invoice?fields=${encodeURIComponent(JSON.stringify(['name', 'cost_center', 'posting_date', 'grand_total', 'total']))}&filters=${encodeURIComponent(JSON.stringify(salesFilters))}&limit_page_length=1000`, {
    headers: getErpHeaders(),
    cache: 'no-store',
  });

  if (!salesResponse.ok) {
    return [] as Array<Record<string, unknown>>;
  }

  const salesPayload = (await salesResponse.json()) as { data?: Array<Record<string, unknown>> };
  const invoices = salesPayload.data ?? [];
  if (!invoices.length) return [];

  const costCenterCandidates = costCenter ? getCostCenterCandidates(costCenter).map((candidate) => normalizeCostCenter(candidate)) : [];
  const relevantInvoices = costCenterCandidates.length
    ? invoices.filter((invoice) => {
        const invoiceCostCenter = normalizeCostCenter(invoice.cost_center);
        return !invoiceCostCenter || costCenterCandidates.some((candidate) => invoiceCostCenter === candidate || invoiceCostCenter.includes(candidate) || candidate.includes(invoiceCostCenter));
      })
    : invoices;
  const invoiceNames = relevantInvoices.map((invoice) => String(invoice.name ?? '')).filter(Boolean);
  if (!invoiceNames.length) return [];

  const invoiceDetails: Array<Array<Record<string, unknown>>> = [];
  for (let index = 0; index < invoiceNames.length; index += 20) {
    const batch = invoiceNames.slice(index, index + 20);
    const results = await Promise.allSettled(batch.map(async (invoiceName) => {
      const response = await fetch(`${baseUrl}/api/resource/Sales%20Invoice/${encodeURIComponent(invoiceName)}`, {
        headers: getErpHeaders(),
        cache: 'no-store',
      });
      if (!response.ok) return [] as Array<Record<string, unknown>>;
      const payload = (await response.json()) as { data?: { items?: Array<Record<string, unknown>> } };
      return (payload.data?.items ?? []).map((row): Record<string, unknown> => ({ ...row, parent: invoiceName }));
    }));
    invoiceDetails.push(...results.map((result) => result.status === 'fulfilled' ? result.value : []));
  }

  const invoiceRows = invoiceDetails.flat();

  return invoiceRows.filter((row) => {
    if (!costCenter) return true;
    const rowCostCenter = String(row.cost_center ?? '');
    if (rowCostCenter) {
      const rowNormalized = normalizeCostCenter(rowCostCenter);
      const costCenterMatch = getCostCenterCandidates(costCenter).some((candidate) => normalizeCostCenter(candidate) === rowNormalized || rowNormalized.includes(normalizeCostCenter(candidate)) || normalizeCostCenter(candidate).includes(rowNormalized));
      if (costCenterMatch) return true;
    }

    const warehouse = normalizeErpText(row.warehouse ?? row.warehouse_name ?? '');
    return warehouse.includes('thoi trang') && warehouse.includes('q4');
  });
}

async function getErpProfitLossFromGlEntries(fromDate: string, toDate: string, costCenter: string) {
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');
  const costCenterAliases = getCostCenterCandidates(costCenter);
  const company = await getErpCompanyName();
  const fields = encodeURIComponent(JSON.stringify(['account', 'debit', 'credit', 'cost_center']));
  const filters = encodeURIComponent(JSON.stringify([
    ['GL Entry', 'posting_date', 'between', [fromDate, toDate]],
    ['GL Entry', 'company', '=', company],
    ['GL Entry', 'is_cancelled', '=', 0],
  ]));
  const response = await fetch(`${baseUrl}/api/resource/GL%20Entry?fields=${fields}&filters=${filters}&limit_page_length=100000`, {
    headers: getErpHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`ERP GL Entry request failed (${response.status})`);

  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
  const entries = (payload.data ?? []).filter((entry) => {
    const entryCostCenter = normalizeCostCenter(entry.cost_center);
    return costCenterAliases.some((candidate) => {
      const alias = normalizeCostCenter(candidate);
      return entryCostCenter === alias || entryCostCenter.startsWith(alias) || alias.startsWith(entryCostCenter);
    });
  });
  const accountFields = encodeURIComponent(JSON.stringify(['name', 'root_type']));
  const accountResponse = await fetch(`${baseUrl}/api/resource/Account?fields=${accountFields}&limit_page_length=10000`, {
    headers: getErpHeaders(),
    cache: 'no-store',
  });
  if (!accountResponse.ok) throw new Error(`ERP Account request failed (${accountResponse.status})`);

  const accountPayload = (await accountResponse.json()) as { data?: Array<Record<string, unknown>> };
  const accountTypes = new Map((accountPayload.data ?? []).map((account) => [String(account.name ?? ''), String(account.root_type ?? '')]));
  let income = 0;
  let expenses = 0;
  for (const entry of entries) {
    const net = toNumber(entry.credit) - toNumber(entry.debit);
    const rootType = accountTypes.get(String(entry.account ?? ''));
    if (rootType === 'Income') income += net;
    if (rootType === 'Expense') expenses -= net;
  }

  if (!entries.length || (!income && !expenses)) throw new Error('ERP GL Entry returned no income or expense rows for cost center');
  return { income, expenses, profit: income - expenses };
}

export async function getErpWarehouseReport(warehouse: string, itemGroup: string, unitType: 'piece' | 'meter', year = new Date().getFullYear(), selectedMonth = new Date().getMonth() + 1, costCenter?: string) {
  const cacheKey = `${warehouse}|${itemGroup}|${unitType}|${year}|${selectedMonth}|${costCenter ?? ''}`;
  let monthly: Array<Array<Record<string, unknown>>>;
  let itemWiseWarning: string | undefined;

  try {
    monthly = await Promise.all(Array.from({ length: 12 }, async (_, index) => {
      const month = index + 1;
      const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const toDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

      try {
        if (!costCenter) {
          const reportRows = await getErpItemWiseSalesRows(fromDate, toDate, { warehouse, item_group: itemGroup });
          if (reportRows.length) {
            return reportRows;
          }
        }
      } catch {
        // fall through to direct sales invoice fallback below
      }

      const directRows = await getErpSalesInvoiceMonthlyRows(fromDate, toDate, costCenter);
      return directRows.filter((row) => matchesWarehouseReportRow(row, warehouse, itemGroup, unitType));
    }));
  } catch (error) {
    const cached = erpWarehouseReportCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.value,
        dataStatus: 'stale' as const,
        warningMessage: 'ERP phản hồi chậm hoặc lỗi tạm thời. Đang hiển thị dữ liệu cache gần nhất.',
      };
    }

    if (!costCenter) throw error;
    monthly = Array.from({ length: 12 }, () => []);
    itemWiseWarning = 'Không tải được dữ liệu live theo chi nhánh và tháng trên ERP; dữ liệu chi tiết đang chưa đồng bộ.';
  }
  let rows = monthly.flat().filter((row) => matchesWarehouseReportRow(row, warehouse, itemGroup, unitType));

  if (!rows.length && costCenter) {
    for (const monthIndex of Array.from({ length: 12 }, (_, index) => index + 1)) {
      const monthFrom = `${year}-${String(monthIndex).padStart(2, '0')}-01`;
      const monthTo = `${year}-${String(monthIndex).padStart(2, '0')}-${String(new Date(year, monthIndex, 0).getDate()).padStart(2, '0')}`;
      const broaderRows = await getErpSalesInvoiceMonthlyRows(monthFrom, monthTo);
      rows = rows.concat(broaderRows.filter((row) => matchesWarehouseReportRow(row, warehouse, itemGroup, unitType) || matchesWarehouse(row, warehouse) || matchesItemGroup(row, itemGroup)));
    }
  }

  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const row of rows) {
    const sku = String(row.item_code ?? row.item_name ?? 'Không rõ');
    const current = productMap.get(sku) ?? { name: String(row.item_name ?? sku), quantity: 0, revenue: 0 };
    current.quantity += toNumber(row.qty ?? row.invoiced_qty ?? row.stock_qty);
    current.revenue += toNumber(row.amount ?? row.total ?? row.base_amount);
    productMap.set(sku, current);
  }
  const monthlySummary = monthly.map((monthRows, index) => {
    const filtered = monthRows.filter((row) => matchesWarehouseReportRow(row, warehouse, itemGroup, unitType));
    const quantity = filtered.reduce((sum, row) => sum + toNumber(row.qty ?? row.invoiced_qty ?? row.stock_qty), 0);
    const revenue = filtered.reduce((sum, row) => sum + toNumber(row.amount ?? row.total ?? row.base_amount), 0);
    const invoices = new Set(filtered.map((row) => String(row.invoice ?? row.voucher_no ?? row.parent ?? '')).filter(Boolean));
    return { label: `Tháng ${index + 1}`, quantity, revenue, expenses: 0, orders: invoices.size };
  });
  const totalRevenue = rows.reduce((sum, row) => sum + toNumber(row.amount ?? row.total ?? row.base_amount), 0);
  const totalQuantity = rows.reduce((sum, row) => sum + toNumber(row.qty ?? row.invoiced_qty ?? row.stock_qty), 0);
  const totalOrders = new Set(rows.map((row) => String(row.invoice ?? row.voucher_no ?? row.parent ?? '')).filter(Boolean)).size;
  const topProducts = [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const latest = monthlySummary[new Date().getMonth()];
  const previous = monthlySummary[Math.max(new Date().getMonth() - 1, 0)];
  const selected = monthlySummary[selectedMonth - 1] ?? monthlySummary[0];
  const selectedPrevious = monthlySummary[Math.max(selectedMonth - 2, 0)] ?? monthlySummary[0];
  let selectedPnl = { income: selected.revenue, expenses: 0, profit: selected.revenue };
  let warningMessage: string | undefined;
  let financialDataAvailable = !costCenter;
  if (costCenter) {
    try {
      selectedPnl = await getErpProfitLossForPeriod(
        `${year}-${String(selectedMonth).padStart(2, '0')}-01`,
        `${year}-${String(selectedMonth).padStart(2, '0')}-${String(new Date(year, selectedMonth, 0).getDate()).padStart(2, '0')}`,
        costCenter,
      );
      financialDataAvailable = true;
    } catch {
      try {
        selectedPnl = await getErpProfitLossFromGlEntries(
          `${year}-${String(selectedMonth).padStart(2, '0')}-01`,
          `${year}-${String(selectedMonth).padStart(2, '0')}-${String(new Date(year, selectedMonth, 0).getDate()).padStart(2, '0')}`,
          costCenter,
        );
        financialDataAvailable = true;
        warningMessage = itemWiseWarning ?? 'P&L report ERP không khả dụng; KPI đã được tính từ GL Entry theo cost center.';
      } catch {
        selectedPnl = { income: 0, expenses: 0, profit: 0 };
        financialDataAvailable = false;
        warningMessage = itemWiseWarning ?? 'Chưa lấy được dữ liệu live P&L ERP cho chi nhánh đã chọn; không hiển thị số liệu giả.';
      }
    }
  }

  if (costCenter && selectedPnl.income > 0) {
    selected.revenue = selectedPnl.income;
  }

  if (!rows.length && costCenter) {
    const liveRevenueWarning = 'ERP chưa trả về dữ liệu live cho chi nhánh này trong khoảng thời gian đã chọn; số liệu đang rỗng vì nguồn dữ liệu chưa đồng bộ.';
    warningMessage = warningMessage ? `${warningMessage} ${liveRevenueWarning}` : liveRevenueWarning;
  }

  const report: ErpWarehouseReport = {
    warehouse,
    itemGroup,
    totalRevenue,
    totalQuantity,
    totalOrders,
    monthlySummary,
    topProducts,
    revenueChange: selectedPrevious.revenue ? ((selected.revenue - selectedPrevious.revenue) / selectedPrevious.revenue) * 100 : 0,
    selectedMonth,
    selectedRevenue: selected.revenue,
    selectedQuantity: selected.quantity,
    selectedOrders: selected.orders,
    selectedPreviousRevenue: selectedPrevious.revenue,
    selectedPreviousQuantity: selectedPrevious.quantity,
    selectedPreviousOrders: selectedPrevious.orders,
    selectedExpenses: selectedPnl.expenses,
    selectedProfit: selectedPnl.profit,
    selectedPnlRevenue: selectedPnl.income,
    financialDataAvailable,
    dataStatus: 'live',
    warningMessage: itemWiseWarning ?? warningMessage,
  };

  report.monthlySummary[selectedMonth - 1].expenses = selectedPnl.expenses;

  erpWarehouseReportCache.set(cacheKey, { expiresAt: Date.now() + ERP_WAREHOUSE_REPORT_CACHE_TTL_MS, value: report });
  return report;
}

function isMeterUom(value: unknown) {
  const uom = normalizeErpText(value);
  return uom === 'm' || uom.includes('met') || uom.includes('mtr');
}

function isFabricSalesReportRow(row: Record<string, unknown>) {
  const group = normalizeErpText(row.item_group ?? row.item_group_name ?? row.category);
  if (group) return group.includes('vai') || group.includes('fabric');
  return isMeterUom(row.uom ?? row.stock_uom ?? row.unit);
}

function isFashionSalesReportRow(row: Record<string, unknown>) {
  const group = normalizeErpText(row.item_group ?? row.item_group_name ?? row.category);
  const unit = normalizeErpText(row.uom ?? row.stock_uom ?? row.unit);
  return group === 'thanh pham' && (unit.includes('cai') || unit.includes('piece') || unit.includes('pcs') || unit.includes('unit') || unit.includes('nos'));
}

const erpOrderItemsCache = new Map<string, { expiresAt: number; items: Array<Record<string, unknown>> }>();
let erpItemMasterCache: { expiresAt: number; items: Array<Record<string, unknown>> } | null = null;

async function getErpItemMaster(baseUrl: string) {
  if (erpItemMasterCache && erpItemMasterCache.expiresAt > Date.now()) {
    return erpItemMasterCache.items;
  }

  const fields = encodeURIComponent(JSON.stringify(['item_code', 'item_name', 'item_group', 'stock_uom']));
  const response = await fetch(`${baseUrl}/api/resource/Item?fields=${fields}&limit_page_length=10000`, {
    headers: getErpHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error('ERP item master request failed');

  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
  const items = payload.data ?? [];
  erpItemMasterCache = { expiresAt: Date.now() + 5 * 60 * 1000, items };
  return items;
}

async function getSalesOrderItems(baseUrl: string, orderNames: string[]) {
  const uniqueNames = [...new Set(orderNames)];
  const items: Array<Record<string, unknown>> = [];
  const missingNames = uniqueNames.filter((orderName) => {
    const cached = erpOrderItemsCache.get(orderName);
    if (cached && cached.expiresAt > Date.now()) {
      items.push(...cached.items);
      return false;
    }
    return true;
  });

  for (let index = 0; index < missingNames.length; index += 100) {
    const batch = await Promise.all(missingNames.slice(index, index + 100).map(async (orderName) => {
      const response = await fetch(`${baseUrl}/api/resource/Sales%20Order/${encodeURIComponent(orderName)}`, {
        headers: getErpHeaders(),
        cache: 'no-store',
      });

      if (!response.ok) return { orderName, items: [] };

      const payload = (await response.json()) as { data?: { items?: Array<Record<string, unknown>> } };
      const orderItems = (payload.data?.items ?? []).map((item) => ({ ...item, parent: orderName }));
      return { orderName, items: orderItems };
    }));

    for (const result of batch) {
      erpOrderItemsCache.set(result.orderName, { expiresAt: Date.now() + 5 * 60 * 1000, items: result.items });
      items.push(...result.items);
    }
  }

  return items;
}

export async function getErpFashionPipelineData(fromDate?: string, toDate?: string) {
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');
  const fields = encodeURIComponent(JSON.stringify(['name', 'status', 'transaction_date']));
  const masterFields = encodeURIComponent(JSON.stringify(['item_code', 'item_name', 'item_group', 'stock_uom']));
  const filters = fromDate && toDate
    ? `&filters=${encodeURIComponent(JSON.stringify([['Sales Order', 'transaction_date', 'between', [fromDate, toDate]]]))}`
    : '';
  const [ordersResponse, masterResponse] = await Promise.all([
    fetch(`${baseUrl}/api/resource/Sales%20Order?fields=${fields}${filters}&limit_page_length=5000`, { headers: getErpHeaders(), cache: 'no-store' }),
    fetch(`${baseUrl}/api/resource/Item?fields=${masterFields}&limit_page_length=10000`, { headers: getErpHeaders(), cache: 'no-store' }),
  ]);

  if (!ordersResponse.ok || !masterResponse.ok) throw new Error('ERP fashion pipeline request failed');

  const ordersPayload = (await ordersResponse.json()) as { data?: Array<Record<string, unknown>> };
  const masterPayload = (await masterResponse.json()) as { data?: Array<Record<string, unknown>> };
  const masterByCode = new Map((masterPayload.data ?? []).map((item) => [String(item.item_code ?? ''), item]));
  const orders = ordersPayload.data ?? [];
  const items = await getSalesOrderItems(baseUrl, orders.map((order) => String(order.name ?? '')).filter(Boolean));
  const fashionOrders = new Set<string>();
  const orderStatus = new Map(orders.map((order) => [String(order.name ?? ''), String(order.status ?? 'Draft')]));
  const statusCounts = new Map<string, Set<string>>();
  const statusQuantities = new Map<string, number>();
  let totalFashionQuantity = 0;

  for (const item of items) {
    const parent = String(item.parent ?? '');
    const master = masterByCode.get(String(item.item_code ?? '')) ?? {};
    if (!parent || !isFashionErpItem({ ...item, ...master })) continue;

    fashionOrders.add(parent);
    const status = orderStatus.get(parent) ?? 'Draft';
    const statusOrders = statusCounts.get(status) ?? new Set<string>();
    statusOrders.add(parent);
    statusCounts.set(status, statusOrders);
    const quantity = toNumber(item.qty);
    statusQuantities.set(status, (statusQuantities.get(status) ?? 0) + quantity);
    totalFashionQuantity += quantity;
  }

  const stages = [
    { status: 'Draft', name: 'Mới' },
    { status: 'To Deliver', name: 'Chờ giao hàng' },
    { status: 'To Bill', name: 'Chờ lập hóa đơn' },
    { status: 'Completed', name: 'Thành công' },
    { status: 'Cancelled', name: 'Đã hủy' },
  ];

  return stages.map(({ status, name }) => ({
    name,
    value: statusCounts.get(status)?.size ?? 0,
    quantity: statusQuantities.get(status) ?? 0,
    totalFashionQuantity,
    totalFashionOrders: fashionOrders.size,
  }));
}

export async function getErpFashionMonthlyComparison(year: number) {
  const monthlySales = await Promise.all(Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const toDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    return getErpItemWiseSalesRows(fromDate, toDate, {
      warehouse: FASHION_QUAN_4_WAREHOUSE,
      item_group: 'Thành phẩm',
    });
  }));

  return monthlySales.map((rows, index) => {
    const fashionRows = rows.filter(isFashionSalesReportRow);
    const quantity = fashionRows.reduce((sum, row) => sum + toNumber(row.qty ?? row.invoiced_qty ?? row.stock_qty), 0);
    const previousRows = monthlySales[index - 1]?.filter(isFashionSalesReportRow) ?? [];
    const previousQuantity = previousRows.reduce((sum, row) => sum + toNumber(row.qty ?? row.invoiced_qty ?? row.stock_qty), 0);
    const orderNumbers = new Set(fashionRows.map((row) => String(row.voucher_no ?? row.sales_invoice ?? row.invoice ?? row.parent ?? '')).filter(Boolean));
    const previousOrderNumbers = new Set(previousRows.map((row) => String(row.voucher_no ?? row.sales_invoice ?? row.invoice ?? row.parent ?? '')).filter(Boolean));
    return {
      label: `Tháng ${index + 1}`,
      total: orderNumbers.size,
      quantity,
      delta: orderNumbers.size - previousOrderNumbers.size,
      deltaQuantity: quantity - previousQuantity,
    };
  });
}

export async function getErpFabricProgress(fromDate: string, toDate: string, warehouse = FABRIC_QUAN_4_WAREHOUSE) {
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');
  const fields = encodeURIComponent(JSON.stringify(['name', 'status', 'transaction_date']));
  const masterFields = encodeURIComponent(JSON.stringify(['item_code', 'item_name', 'item_group', 'stock_uom']));
  const filters = encodeURIComponent(JSON.stringify([['Sales Order', 'transaction_date', 'between', [fromDate, toDate]]]));
  const [ordersResponse, masterResponse] = await Promise.all([
    fetch(`${baseUrl}/api/resource/Sales%20Order?fields=${fields}&filters=${filters}&limit_page_length=5000`, {
      headers: getErpHeaders(),
      cache: 'no-store',
    }),
    fetch(`${baseUrl}/api/resource/Item?fields=${masterFields}&limit_page_length=10000`, {
      headers: getErpHeaders(),
      cache: 'no-store',
    }),
  ]);

  if (!ordersResponse.ok || !masterResponse.ok) {
    throw new Error('ERP fabric progress request failed');
  }

  const ordersPayload = (await ordersResponse.json()) as { data?: Array<Record<string, unknown>> };
  const masterPayload = (await masterResponse.json()) as { data?: Array<Record<string, unknown>> };
  const itemsPayload = { data: await getSalesOrderItems(baseUrl, (ordersPayload.data ?? []).map((order) => String(order.name ?? '')).filter(Boolean)) };
  const masterByCode = new Map((masterPayload.data ?? []).map((item) => [String(item.item_code ?? ''), item]));
  const orderStatus = new Map<string, string>();
  const fabricOrders = new Set<string>();
  const statusCounts = new Map<string, Set<string>>();
  const statusMeters = new Map<string, number>();

  for (const order of ordersPayload.data ?? []) {
    const name = String(order.name ?? '');
    if (name) orderStatus.set(name, String(order.status ?? 'Draft'));
  }

  for (const item of itemsPayload.data ?? []) {
    const parent = String(item.parent ?? '');
    const master = masterByCode.get(String(item.item_code ?? '')) ?? {};
    if (parent && matchesWarehouse(item, warehouse) && isFabricErpItem({ ...item, ...master })) {
      fabricOrders.add(parent);
      const status = orderStatus.get(parent) ?? 'Draft';
      const orders = statusCounts.get(status) ?? new Set<string>();
      orders.add(parent);
      statusCounts.set(status, orders);
      statusMeters.set(status, (statusMeters.get(status) ?? 0) + toNumber(item.qty));
    }
  }

  const stages = [
    { name: 'Đơn vải mới', statuses: ['Draft'] },
    { name: 'Đang chuẩn bị vải', statuses: ['To Deliver'] },
    { name: 'Chờ xuất hóa đơn', statuses: ['To Bill'] },
    { name: 'Đã hoàn tất', statuses: ['Completed'] },
    { name: 'Đã hủy', statuses: ['Cancelled'] },
  ];
  const maxValue = Math.max(...stages.map((stage) => stage.statuses.reduce((sum, status) => sum + (statusCounts.get(status)?.size ?? 0), 0)), 1);

  return stages.map((stage) => {
    const count = stage.statuses.reduce((sum, status) => sum + (statusCounts.get(status)?.size ?? 0), 0);
    return {
      name: stage.name,
      count,
      meters: statusMeters.get(stage.statuses[0]) ?? 0,
      progress: Math.round((count / maxValue) * 100),
      owner: 'ERP GUSAZ',
      totalFabricOrders: fabricOrders.size,
    };
  });
}

export async function getErpFabricMonthlyComparison(year: number, warehouse = FABRIC_QUAN_4_WAREHOUSE) {
  const monthlySales = await Promise.all(Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const toDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    return getErpItemWiseSalesRows(fromDate, toDate, {
      warehouse,
      item_group: 'Vải',
    });
  }));

  return monthlySales.map((rows, index) => {
    // The ERP report already applies warehouse + item-group filters. Keep every meter row
    // returned by that report so valid rows are not removed by inconsistent group labels.
    const meterRows = rows.filter((row) => isMeterUom(row.uom ?? row.stock_uom ?? row.unit));
    const meters = meterRows
      .reduce((sum, row) => sum + toNumber(row.qty ?? row.invoiced_qty ?? row.stock_qty), 0);
    const previousRows = monthlySales[index - 1] ?? [];
    const previousMeterRows = previousRows.filter((row) => isMeterUom(row.uom ?? row.stock_uom ?? row.unit));
    const previousMeters = previousMeterRows
      .reduce((sum, row) => sum + toNumber(row.qty ?? row.invoiced_qty ?? row.stock_qty), 0);
    const orderNumbers = new Set(meterRows.map((row) => String(row.voucher_no ?? row.sales_invoice ?? row.invoice ?? row.parent ?? '')).filter(Boolean));
    const previousOrderNumbers = new Set(previousMeterRows.map((row) => String(row.voucher_no ?? row.sales_invoice ?? row.invoice ?? row.parent ?? '')).filter(Boolean));
    return {
      label: `Tháng ${index + 1}`,
      total: orderNumbers.size,
      delta: orderNumbers.size - previousOrderNumbers.size,
      meters,
      deltaMeters: meters - previousMeters,
    };
  });
}

export type ErpProductAnalysisRow = {
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
  soldQuantity: number;
  orderCount: number;
  revenue: number;
  stock: number;
  reorderPoint: number;
};

export async function getErpProductAnalysis(): Promise<ErpProductAnalysisRow[]> {
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');
  const fields = (value: string[]) => encodeURIComponent(JSON.stringify(value));
  const company = await getErpCompanyName();

  const [itemsResponse, binsResponse, invoiceItemsResponse] = await Promise.all([
    fetch(`${baseUrl}/api/resource/Item?fields=${fields(['name', 'item_code', 'item_name', 'item_group', 'standard_rate'])}&limit_page_length=100`, {
      headers: getErpHeaders(),
      cache: 'no-store',
    }),
    fetch(`${baseUrl}/api/resource/Bin?fields=${fields(['item_code', 'actual_qty', 'warehouse'])}&limit_page_length=1000`, {
      headers: getErpHeaders(),
      cache: 'no-store',
    }),
    fetch(`${baseUrl}/api/resource/Sales%20Invoice%20Item?fields=${fields(['item_code', 'parent', 'qty', 'rate', 'amount', 'base_amount', 'net_amount', 'base_net_amount'])}&limit_page_length=5000`, {
      headers: getErpHeaders(),
      cache: 'no-store',
    }),
  ]);

  if (!itemsResponse.ok || !binsResponse.ok || !invoiceItemsResponse.ok) {
    throw new Error('ERP product analysis request failed');
  }

  const itemsPayload = (await itemsResponse.json()) as { data?: Array<Record<string, unknown>> };
  const binsPayload = (await binsResponse.json()) as { data?: Array<Record<string, unknown>> };
  const invoiceItemsPayload = (await invoiceItemsResponse.json()) as { data?: Array<Record<string, unknown>> };
  const orderItemsResponse = await fetch(`${baseUrl}/api/resource/Sales%20Order%20Item?fields=${fields(['item_code', 'parent', 'qty', 'rate', 'amount', 'base_amount'])}&limit_page_length=5000`, {
    headers: getErpHeaders(),
    cache: 'no-store',
  });
  const orderItemsPayload = orderItemsResponse.ok
    ? (await orderItemsResponse.json()) as { data?: Array<Record<string, unknown>> }
    : { data: [] };
  const stockBySku = new Map<string, number>();
  const soldBySku = new Map<string, { quantity: number; revenue: number }>();
  const orderedBySku = new Map<string, { quantity: number; revenue: number }>();
  const reportSalesBySku = new Map<string, { quantity: number; revenue: number }>();
  const invoiceOrdersBySku = new Map<string, Set<string>>();
  const orderOrdersBySku = new Map<string, Set<string>>();
  const reportOrdersBySku = new Map<string, Set<string>>();

  for (const bin of binsPayload.data ?? []) {
    const sku = String(bin.item_code ?? '');
    if (sku) stockBySku.set(sku, (stockBySku.get(sku) ?? 0) + toNumber(bin.actual_qty));
  }

  for (const invoiceItem of invoiceItemsPayload.data ?? []) {
    const sku = String(invoiceItem.item_code ?? '');
    if (!sku) continue;

    const quantity = toNumber(invoiceItem.qty);
    const amount = toNumber(invoiceItem.amount)
      || toNumber(invoiceItem.base_amount)
      || toNumber(invoiceItem.net_amount)
      || toNumber(invoiceItem.base_net_amount)
      || quantity * toNumber(invoiceItem.rate);
    const current = soldBySku.get(sku) ?? { quantity: 0, revenue: 0 };
    soldBySku.set(sku, {
      quantity: current.quantity + quantity,
      revenue: current.revenue + amount,
    });
    const orderNumber = String(invoiceItem.parent ?? '');
    if (orderNumber) {
      const orders = invoiceOrdersBySku.get(sku) ?? new Set<string>();
      orders.add(orderNumber);
      invoiceOrdersBySku.set(sku, orders);
    }
  }

  for (const orderItem of orderItemsPayload.data ?? []) {
    const sku = String(orderItem.item_code ?? '');
    if (!sku) continue;

    const quantity = toNumber(orderItem.qty);
    const amount = toNumber(orderItem.amount)
      || toNumber(orderItem.base_amount)
      || quantity * toNumber(orderItem.rate);
    const current = orderedBySku.get(sku) ?? { quantity: 0, revenue: 0 };
    orderedBySku.set(sku, {
      quantity: current.quantity + quantity,
      revenue: current.revenue + amount,
    });
    const orderNumber = String(orderItem.parent ?? '');
    if (orderNumber) {
      const orders = orderOrdersBySku.get(sku) ?? new Set<string>();
      orders.add(orderNumber);
      orderOrdersBySku.set(sku, orders);
    }
  }

  try {
    const reportResponse = await fetch(`${baseUrl}/api/method/frappe.desk.query_report.run`, {
      method: 'POST',
      headers: { ...getErpHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        report_name: 'Item-wise Sales Register',
        filters: JSON.stringify({
          company,
          from_date: '2020-01-01',
          to_date: new Date().toISOString().slice(0, 10),
        }),
        ignore_prepared_report: 'true',
      }),
      cache: 'no-store',
    });

    if (reportResponse.ok) {
      const reportPayload = (await reportResponse.json()) as { message?: { result?: Array<Record<string, unknown>> } };

      for (const row of reportPayload.message?.result ?? []) {
        const sku = String(row.item_code ?? row.item ?? '');
        if (!sku) continue;

        const quantity = toNumber(row.qty ?? row.invoiced_qty ?? row.stock_qty ?? row.total_qty ?? row.quantity);
        const revenue = toNumber(row.amount)
          || toNumber(row.base_net_amount)
          || toNumber(row.net_amount)
          || toNumber(row.base_amount)
          || toNumber(row.total_amount)
          || toNumber(row.net_total);
        const current = reportSalesBySku.get(sku) ?? { quantity: 0, revenue: 0 };
        reportSalesBySku.set(sku, {
          quantity: current.quantity + quantity,
          revenue: current.revenue + revenue,
        });
        const voucherNumber = String(row.voucher_no ?? row.sales_invoice ?? row.sales_order ?? row.invoice ?? row.parent ?? row.reference_name ?? '');
        if (voucherNumber) {
          const orders = reportOrdersBySku.get(sku) ?? new Set<string>();
          orders.add(voucherNumber);
          reportOrdersBySku.set(sku, orders);
        }
      }
    }
  } catch {
    // Use the resource endpoints when the ERP report is unavailable.
  }

  const hasReportSales = [...reportSalesBySku.values()].some((sales) => sales.quantity !== 0 || sales.revenue !== 0);
  const hasInvoiceSales = [...soldBySku.values()].some((sales) => sales.quantity !== 0 || sales.revenue !== 0);

  return (itemsPayload.data ?? []).map((item) => {
    const sku = String(item.item_code ?? item.name ?? '');
    const salesSource = hasReportSales ? reportSalesBySku : hasInvoiceSales ? soldBySku : orderedBySku;
    const sales = salesSource.get(sku) ?? { quantity: 0, revenue: 0 };
    const reportOrderCount = reportOrdersBySku.get(sku)?.size ?? 0;
    const invoiceOrderCount = invoiceOrdersBySku.get(sku)?.size ?? 0;
    const orderOrderCount = orderOrdersBySku.get(sku)?.size ?? 0;

    return {
      sku,
      name: String(item.item_name ?? item.name ?? sku),
      category: String(item.item_group ?? 'Chưa phân loại'),
      unitPrice: toNumber(item.standard_rate),
      soldQuantity: sales.quantity,
      orderCount: reportOrderCount || invoiceOrderCount || orderOrderCount,
      revenue: sales.revenue,
      stock: stockBySku.get(sku) ?? 0,
      reorderPoint: 0,
    };
  });
}

function formatChange(current: number, previous: number) {
  if (!previous) return 'Mới';
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
}

async function getErpList(doctype: string, fields: string[], filters: unknown[][] = [], limitPageLength = 20) {
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/method/frappe.client.get_list`, {
    method: 'POST',
    headers: { ...getErpHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      doctype,
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
      limit_page_length: String(limitPageLength),
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`ERP list request failed for ${doctype}: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { message?: Array<Record<string, unknown>> };
  return Array.isArray(payload.message) ? payload.message : [];
}

async function getErpCount(doctype: string) {
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/method/frappe.client.get_count?doctype=${encodeURIComponent(doctype)}`, {
    headers: getErpHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`ERP count request failed for ${doctype}: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { message?: number | string };
  return toNumber(payload.message);
}

async function getFrappeResourceSummary(): Promise<ErpDashboardPayload | null> {
  const baseUrl = (process.env.ERP_API_URL || 'https://gusaz.com').replace(/\/$/, '');

  const currentYear = new Date().getFullYear();
  const [customerData, salesOrders, itemData, customerCount, itemCount, profitAndLoss, previousYearProfitAndLoss, monthlyReport, pipelineCounts, monthlyOrderComparison] = await Promise.all([
    getErpList('Customer', ['name', 'customer_name'], [], 10).catch(() => []),
    getErpList('Sales Order', ['name', 'status', 'grand_total'], [['docstatus', '!=', 2]], 20).catch(() => []),
    getErpList('Item', ['name', 'item_group', 'standard_rate'], [], 20).catch(() => []),
    getErpCount('Customer').catch(() => 0),
    getErpCount('Item').catch(() => 0),
    getProfitAndLossSummary(baseUrl, 'Yearly', currentYear),
    getProfitAndLossSummary(baseUrl, 'Yearly', currentYear - 1),
    getProfitAndLossSummary(baseUrl, 'Monthly'),
    getErpPipelineData().catch(() => []),
    getMonthlyOrderComparison(baseUrl).catch(() => []),
  ]);

  const validOrders = salesOrders.filter((order) => {
    const status = String((order as Record<string, unknown>).status ?? '').toLowerCase();
    return status !== 'cancelled' && status !== 'draft';
  });

  const orderRevenue = validOrders.reduce<number>((sum, order) => {
    const grandTotal = toNumber((order as Record<string, unknown>).grand_total);
    return sum + grandTotal;
  }, 0);

  const revenue = profitAndLoss?.income || orderRevenue;
  const profit = profitAndLoss?.profit || 0;
  const monthlyPerformance = monthlyReport?.monthlyPerformance ?? [];
  const latestMonth = [...monthlyPerformance].reverse().find((month) => month.revenue > 0) ?? monthlyPerformance[monthlyPerformance.length - 1];
  const previousMonth = latestMonth ? monthlyPerformance[monthlyPerformance.indexOf(latestMonth) - 1] : undefined;
  const monthlyRevenueChange = latestMonth && previousMonth?.revenue
    ? ((latestMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100
    : 0;
  const [previousCustomerCount, previousItemCount] = await Promise.all([
    getCountBefore(baseUrl, 'Customer', `${currentYear}-01-01`).catch(() => 0),
    getCountBefore(baseUrl, 'Item', `${currentYear}-01-01`).catch(() => 0),
  ]);
  const revenueChange = profitAndLoss && previousYearProfitAndLoss?.income
    ? ((profitAndLoss.income - previousYearProfitAndLoss.income) / Math.abs(previousYearProfitAndLoss.income)) * 100
    : 0;
  const profitChange = profitAndLoss && previousYearProfitAndLoss?.profit
    ? ((profitAndLoss.profit - previousYearProfitAndLoss.profit) / Math.abs(previousYearProfitAndLoss.profit)) * 100
    : 0;
  const aiPlan = latestMonth
    ? [
        monthlyRevenueChange < 0
          ? `Doanh thu tháng ${latestMonth.label} đang giảm ${Math.abs(monthlyRevenueChange).toFixed(1)}% so với tháng trước; nên rà soát kênh bán và tập trung ngân sách vào nhóm có tỷ suất lợi nhuận cao.`
          : `Doanh thu tháng ${latestMonth.label} đang tăng ${monthlyRevenueChange.toFixed(1)}%; nên duy trì nhóm sản phẩm hiệu quả và chuẩn bị tồn kho cho tháng tiếp theo.`,
        latestMonth.profit < 0
          ? 'Lợi nhuận tháng gần nhất đang âm; cần kiểm tra ngay giá vốn, chi phí bán hàng và các khoản giảm trừ doanh thu.'
          : `Biên lợi nhuận tháng gần nhất là ${((latestMonth.profit / Math.max(latestMonth.revenue, 1)) * 100).toFixed(1)}%; nên ưu tiên các đơn hàng giữ được biên này trở lên.`,
      ]
    : ['Chưa đủ dữ liệu tháng để đưa ra định hướng; cần kiểm tra lại báo cáo kết quả kinh doanh trong ERP.'];

  return {
    modules: dashboardData.modules,
    monthlyPerformance,
    monthlyOrderComparison,
    aiPlan,
    metrics: [
      { label: `Doanh thu lũy kế ${currentYear}`, value: formatVnd(revenue), change: `${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}%`, tone: revenueChange >= 0 ? 'up' : 'down' },
      { label: `Lợi nhuận lũy kế ${currentYear}`, value: formatVnd(profit), change: `${profitChange >= 0 ? '+' : ''}${profitChange.toFixed(1)}%`, tone: profitChange >= 0 ? 'up' : 'down' },
      { label: 'Khách hàng', value: String(customerCount), change: formatChange(customerCount, previousCustomerCount), tone: customerCount >= previousCustomerCount ? 'up' : 'down' },
      { label: 'Mặt hàng', value: String(itemCount), change: formatChange(itemCount, previousItemCount), tone: itemCount >= previousItemCount ? 'up' : 'down' },
    ],
    revenueBars: dashboardData.revenueBars,
    aiMessages: [
      `Đã đồng bộ ${customerCount} khách hàng từ ERP GUSAZ Desk.`,
      `Doanh thu theo báo cáo kết quả kinh doanh đang ở mức ${formatVnd(revenue)}.` ,
      `Lợi nhuận sau chi phí theo ERP là ${formatVnd(profit)}.` ,
      `Số lượng sản phẩm đang đồng bộ là ${itemCount}; nên kiểm tra tồn kho trong 48 giờ tới.`,
    ],
    pipeline: pipelineCounts,
  };
}

export async function getErpDashboardData(): Promise<ErpDashboardPayload | null> {
  const { apiUrl, enabled } = getErpConfig();

  if (!enabled || !apiUrl) {
    return null;
  }

  try {
    const connection = await checkErpConnection();
    if (!connection.connected) {
      console.warn('ERP dashboard skipped because connection is not authorized:', connection.status, connection.httpStatus ?? '');
      return null;
    }

    if (apiUrl.includes('gusaz.com')) {
      return await getFrappeResourceSummary();
    }

    const res = await fetch(apiUrl, {
      headers: getErpHeaders(),
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      console.error('ERP API request failed', res.status, res.statusText);
      return null;
    }

    const payload = (await res.json()) as ErpDashboardPayload;

    return {
      modules: payload.modules ?? dashboardData.modules,
      metrics: normalizeMetrics(payload),
      revenueBars: normalizeRevenueBars(payload),
      aiMessages: normalizeAiMessages(payload),
      pipeline: normalizePipeline(payload),
    };
  } catch (error) {
    console.error('ERP API sync error:', error);
    return null;
  }
}
