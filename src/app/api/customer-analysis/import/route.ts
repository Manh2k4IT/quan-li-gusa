import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function firstString(value: unknown) {
  return String(value ?? '').trim();
}

function firstNumber(value: unknown) {
  const text = firstString(value).replace(/[^0-9.-]/g, '');
  if (!text) return 0;
  return Number(text) || 0;
}

async function ensureOrganization() {
  const org = await prisma.organization.findFirst({ where: { slug: 'gusa' } });
  if (org) return org;
  return prisma.organization.create({ data: { name: 'GUSA Enterprise', slug: 'gusa' } });
}

export async function POST(request: Request) {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ message: 'Thiếu file khách hàng.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    if (!rows.length) {
      return NextResponse.json({ message: 'File không có dữ liệu khách hàng.' }, { status: 400 });
    }

    const org = await ensureOrganization();
    let imported = 0;

    for (const row of rows) {
      const name = firstString(row.name ?? row['Tên khách hàng'] ?? row['Customer Name'] ?? row['Khách hàng'] ?? row['Name']);
      if (!name) continue;

      const customerData = {
        name,
        company: firstString(row.company ?? row['Công ty'] ?? row['Company'] ?? row['Doanh nghiệp'] ?? row['Tên công ty']) || null,
        email: firstString(row.email ?? row['Email'] ?? row['Mail']) || null,
        phone: firstString(row.phone ?? row['SĐT'] ?? row['Phone'] ?? row['Điện thoại']) || null,
        status: firstString(row.status ?? row['Trạng thái'] ?? row['Status'] ?? row['Mức độ']) || 'New',
        value: firstNumber(row.value ?? row['Giá trị'] ?? row['Revenue'] ?? row['Doanh số'] ?? row['Total']),
        orgId: org.id,
      };

      const customerMatches = [
        ...(customerData.email ? [{ email: customerData.email }] : []),
        ...(customerData.phone ? [{ phone: customerData.phone }] : []),
        { name: customerData.name },
      ];

      const existing = await prisma.customer.findFirst({
        where: {
          orgId: org.id,
          OR: customerMatches,
        },
      });

      if (existing) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: customerData,
        });
      } else {
        await prisma.customer.create({ data: customerData });
        imported += 1;
      }
    }

    return NextResponse.json({ ok: true, imported, message: `Import thành công ${imported} khách hàng mới.` });
  } catch (error) {
    console.error('Customer import error:', error);
    return NextResponse.json({ message: 'Không thể import dữ liệu khách hàng.' }, { status: 500 });
  }
}
