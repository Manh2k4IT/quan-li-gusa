import DailySalesReportTable from '@/components/daily-sales-report-table';

type CategoryKey = 'fashion-q4' | 'fabric-q4' | 'fabric-ben-thanh';

const categories: Record<CategoryKey, 'Thời trang Quận 4' | 'Vải Quận 4' | 'Vải Bến Thành'> = {
  'fashion-q4': 'Thời trang Quận 4',
  'fabric-q4': 'Vải Quận 4',
  'fabric-ben-thanh': 'Vải Bến Thành',
};

export default async function DailyReportCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const resolvedCategory = categories[category as CategoryKey] ?? 'Thời trang Quận 4';
  return <DailySalesReportTable category={resolvedCategory} />;
}
