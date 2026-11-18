import ui from './ui.it.json' with { type: 'json' };
import tactics from './tactics.it.json' with { type: 'json' };
import errors from './errors.it.json' with { type: 'json' };

// English source strings are stable translation keys, never technical identifiers.
export const t = (key) => ui[key] ?? tactics[key] ?? key;
export const errorText = (message) => errors[message] ??
  (Object.values(errors).includes(message) ? message : errors['Service unavailable']);
const phases = { build_up: 'Build Up', progression: 'Progression', creation: 'Creation', finishing: 'Finishing', defensive_org: 'Defensive Organisation', transition: 'Transition' };
export const phaseLabel = (phase) => t(phases[phase] || '');
export const requestLabel = (key) => key.split('|').map((part, index) => index === 0 ? phaseLabel(part) : part).join(' · ');

export function localizeScenario(item) {
  return {
    ...item,
    phase_label: phaseLabel(item.phase),
    label: t(item.label), title: t(item.title), objective: t(item.objective),
    principles: item.principles.map(t), key_actions: item.key_actions.map(t),
    coaching_points: item.coaching_points.map(t), risk_notes: item.risk_notes.map(t),
    profile: { risk: t(item.profile.risk), verticality: t(item.profile.verticality === 'Medium' ? 'Medium verticality' : item.profile.verticality), tempo: t(item.profile.tempo) },
  };
}
