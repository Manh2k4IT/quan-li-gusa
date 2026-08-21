import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

async function getDefaultOrg() {
  const existing = await prisma.organization.findFirst({
    where: { slug: 'gusa' },
  });

  if (existing) {
    return existing;
  }

  return prisma.organization.create({
    data: { name: 'GUSA Enterprise', slug: 'gusa' },
  });
}

export async function GET() {
  try {
    const inventory = await prisma.inventory.findMany({
      include: { product: true },
      orderBy: [{ stock: 'asc' }, { warehouse: 'asc' }],
      take: 20,
    });

    return NextResponse.json(
      inventory.map((item) => ({
        id: item.id,
        sku: item.product.sku,
        name: item.product.name,
        warehouse: item.warehouse,
        stock: item.stock,
        reorderPoint: item.reorderPoint,
        status: item.stock <= item.reorderPoint ? 'Cần bổ sung' : item.stock > item.reorderPoint * 2 ? 'Dư hàng' : 'Đủ hàng',
      })),
    );
  } catch (error) {
    console.error('Inventory API error:', error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sku = String(body.sku ?? '').trim();
    const name = String(body.name ?? '').trim();
    const warehouse = String(body.warehouse ?? '').trim();

    if (!sku || !name || !warehouse) {
      return NextResponse.json({ message: 'Thiếu dữ liệu kho.' }, { status: 400 });
    }

    const org = await getDefaultOrg();

    const product = await prisma.product.upsert({
      where: { sku },
      update: { name, category: String(body.category ?? 'General') },
      create: {
        name,
        sku,
        category: String(body.category ?? 'General'),
        unitPrice: Number(body.unitPrice ?? 0),
        orgId: org.id,
      },
    });

    const inventory = await prisma.inventory.upsert({
      where: {
        productId_warehouse: {
          productId: product.id,
          warehouse,
        },
      },
      update: {
        stock: Number(body.stock ?? 0),
        reorderPoint: Number(body.reorderPoint ?? 0),
      },
      create: {
        productId: product.id,
        warehouse,
        stock: Number(body.stock ?? 0),
        reorderPoint: Number(body.reorderPoint ?? 0),
      },
    });

    return NextResponse.json({ ok: true, inventory });
  } catch (error) {
    console.error('Inventory create error:', error);
    return NextResponse.json({ message: 'Không thể tạo tồn kho.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const inventoryId = String(body.id ?? '').trim();

    if (!inventoryId) {
      return NextResponse.json({ message: 'Thiếu inventoryId.' }, { status: 400 });
    }

    await prisma.inventory.delete({ where: { id: inventoryId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Inventory delete error:', error);
    return NextResponse.json({ message: 'Không thể xóa tồn kho.' }, { status: 500 });
  }
}
