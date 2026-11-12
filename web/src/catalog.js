import sourceCatalog from './data/catalog.json' with { type: 'json' };
import media from './data/media.json' with { type: 'json' };
import { localizeScenario, phaseLabel } from './i18n/index.js';

export const catalog = { ...sourceCatalog,
  phase_roadmap: sourceCatalog.phase_roadmap.map((item) => ({ ...item, label: phaseLabel(item.id) })),
  combos: sourceCatalog.combos.map(localizeScenario),
};

export function findScenario(phase, own, opp, variant) {
  return catalog.combos.find((item) => item.phase === phase && item.own === own &&
    item.opp === opp && item.variant === variant) || null;
}

// Media hosting is intentionally separate from catalog availability.
export function scenarioVideoUrl(solution, base = '') {
  if (!solution) return '';
  if (!base.trim()) return media[solution.video]?.url || '';
  try {
    const url = new URL(base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '';
    return `${url.href.replace(/\/$/, '')}/${encodeURIComponent(solution.video)}`;
  } catch {
    return '';
  }
}
