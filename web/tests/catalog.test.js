import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, findScenario, scenarioVideoUrl } from '../src/catalog.js';
import media from '../src/data/media.json' with { type: 'json' };

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
  for (const base of ['/videos', 'javascript:alert(1)', 'https://user:secret@example.test', 'https://example.test?token=secret']) {
    assert.equal(scenarioVideoUrl(catalog.combos[0], base), '');
  }
  assert.equal(scenarioVideoUrl(null, 'https://example.test'), '');
});

test('all 24 videos have verified real Blob URLs and content hashes', () => {
  assert.equal(Object.keys(media).length, 24);
  for (const item of catalog.combos) {
    const video = media[item.video];
    assert.ok(video.size > 0);
    assert.match(video.sha256, /^[a-f0-9]{64}$/);
    assert.match(video.url, /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/tactics\//);
    assert.equal(scenarioVideoUrl(item), video.url);
  }
});
