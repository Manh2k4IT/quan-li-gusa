import { redirect } from 'next/navigation';

// Plans for every warehouse now live on one board, filtered by warehouse.
export default function LegacyPlanPage() {
  redirect('/plan?category=fabric-q4');
}
