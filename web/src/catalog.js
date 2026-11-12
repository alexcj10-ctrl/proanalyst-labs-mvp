import catalog from './data/catalog.json' with { type: 'json' };

export { catalog };

export function findScenario(phase, own, opp, variant) {
  return catalog.combos.find((item) => item.phase === phase && item.own === own &&
    item.opp === opp && item.variant === variant) || null;
}

// Media hosting is intentionally separate from catalog availability.
export function scenarioVideoUrl(solution, base = '') {
  if (!solution || !base.trim()) return '';
  try {
    const url = new URL(base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '';
    return `${url.href.replace(/\/$/, '')}/${encodeURIComponent(solution.video)}`;
  } catch {
    return '';
  }
}
