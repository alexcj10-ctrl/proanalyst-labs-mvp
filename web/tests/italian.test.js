import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import source from '../src/data/catalog.json' with { type: 'json' };
import words from '../src/i18n/tactics.it.json' with { type: 'json' };
import ui from '../src/i18n/ui.it.json' with { type: 'json' };
import { catalog, findScenario, scenarioVideoUrl } from '../src/catalog.js';
import { errorText, requestLabel } from '../src/i18n/index.js';

test('all tactical text is translated while every technical field and JSON key stays intact', () => {
  const prose = ['label', 'phase_label', 'title', 'objective', 'principles', 'key_actions', 'risk_notes', 'coaching_points', 'profile'];
  assert.equal(catalog.combos.length, 24);
  for (const original of source.combos) {
    const item = findScenario(original.phase, original.own, original.opp, original.variant);
    assert.deepEqual(Object.keys(item).sort(), Object.keys(original).sort());
    for (const [key, value] of Object.entries(original)) {
      if (!prose.includes(key)) assert.deepEqual(item[key], value, key);
      else {
        const strings = Array.isArray(value) ? value : typeof value === 'object' ? Object.values(value) : [value];
        for (const text of strings) {
          assert.ok(Object.hasOwn(words, text), `Missing Italian translation: ${text}`);
          assert.notEqual(words[text], text);
        }
        assert.notDeepEqual(item[key], value, `${original.scenario_id}: ${key}`);
        if (Array.isArray(value)) assert.equal(item[key].length, value.length);
      }
    }
    assert.equal(scenarioVideoUrl(item), scenarioVideoUrl(original));
  }
  for (const key of Object.keys(source).filter((key) => !['combos', 'phase_roadmap'].includes(key))) assert.deepEqual(catalog[key], source[key]);
});

test('Italian document, dynamic staff labels and safe localized errors', () => {
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /<html lang="it">/);
  assert.equal(requestLabel('build_up|4-3-3|4-4-2'), 'Costruzione dal basso · 4-3-3 · 4-4-2');
  assert.equal(errorText('Invalid credentials'), 'Nome utente o password non corretti.');
  assert.equal(errorText('Failed to fetch'), 'Servizio non disponibile. Riprova più tardi.');
  assert.equal(errorText('Nome utente o password non corretti.'), 'Nome utente o password non corretti.');
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  for (const [, key] of app.matchAll(/\bt\("([^"\n]*)"\)/g)) assert.ok(Object.hasOwn(ui, key) || Object.hasOwn(words, key), key);
});
