import sourceCatalog from './data/catalog.json' with { type: 'json' };
import media from './data/media.json' with { type: 'json' };
import { localizeScenario, phaseLabel } from './i18n/index.js';

export const catalog = { ...sourceCatalog,
  phase_roadmap: sourceCatalog.phase_roadmap.map((item) => ({ ...item, label: phaseLabel(item.id) })),
  combos: sourceCatalog.combos.map(localizeScenario),
};

export function findScenario(phase, own, opp, variant, currentCatalog = catalog) {
  return currentCatalog?.combos.find((item) => item.phase === phase && item.own === own &&
    item.opp === opp && item.variant === variant) || null;
}

// Media hosting is intentionally separate from catalog availability.
export function scenarioVideoUrl(solution, base = '') {
  if (!solution) return '';
  if (solution.video_url) {
    try {
      const url = new URL(solution.video_url);
      return url.protocol === 'https:' && /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) &&
        !url.username && !url.password && !url.search && !url.hash ? url.href : '';
    } catch { return ''; }
  }
  if (!base.trim()) return media[solution.video]?.url || '';
  try {
    const url = new URL(base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '';
    return `${url.href.replace(/\/$/, '')}/${encodeURIComponent(solution.video)}`;
  } catch {
    return '';
  }
}
