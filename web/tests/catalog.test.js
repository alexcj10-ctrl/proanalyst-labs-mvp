import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, findScenario, scenarioVideoUrl } from '../src/catalog.js';
import { serverFeatures } from '../src/services/server.js';

test('all 24 scenarios resolve with the exact variant and filename', () => {
  assert.equal(catalog.combos.length, 24);
  for (const item of catalog.combos) {
    assert.equal(findScenario(item.phase, item.own, item.opp, item.variant), item);
    assert.equal(scenarioVideoUrl(item, 'https://media.example.test/tactics/'), `https://media.example.test/tactics/${item.video}`);
  }
});

test('missing scenarios and variants never silently fall back to A', () => {
  assert.equal(findScenario('build_up', '4-3-3', '4-2-3-1', 'B'), null);
  assert.equal(findScenario('finishing', '4-3-3', '4-3-3', 'A'), null);
  assert.equal(findScenario('build_up', '5-4-1', '5-4-1', 'A'), null);
  assert.equal(findScenario('finishing', '4-3-3', '4-3-3', 'FA').video, '433vs433FA.mp4');
});

test('unconfigured or unsafe media origins do not create broken video URLs', () => {
  for (const base of ['', ' ', '/videos', 'javascript:alert(1)', 'https://user:secret@example.test', 'https://example.test?token=secret']) {
    assert.equal(scenarioVideoUrl(catalog.combos[0], base), '');
  }
  assert.equal(scenarioVideoUrl(null, 'https://example.test'), '');
});

test('all server capabilities are explicitly unavailable', () => {
  assert.equal(Object.keys(serverFeatures).length, 4);
  for (const feature of Object.values(serverFeatures)) assert.equal(feature.available, false);
});
