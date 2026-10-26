import Link from 'next/link';
import { Icon, type IconName } from '@/components/icons';

export type HubTile = { href: string; title: string; description: string; icon: IconName; tone?: 'indigo' | 'violet' | 'cyan' | 'emerald' };
export type HubSection = { title: string; tiles: HubTile[] };

export default function ReportHub({ eyebrow, title, subtitle, sections }: { eyebrow: string; title: string; subtitle: string; sections: HubSection[] }) {
  return (
    <main className="workspace-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="users-subtitle">{subtitle}</p>
        </div>
      </header>

      {sections.map((section) => (
        <section key={section.title} className="report-section">
          <h3 className="report-section-title">{section.title}</h3>
          <div className="report-tiles">
            {section.tiles.map((tile) => (
              <Link key={tile.href} href={tile.href} className={`report-tile users-stat-${tile.tone ?? 'indigo'}`}>
                <span className="report-tile-icon"><Icon name={tile.icon} size={22} /></span>
                <div>
                  <strong>{tile.title}</strong>
                  <p>{tile.description}</p>
                </div>
                <span className="report-tile-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
