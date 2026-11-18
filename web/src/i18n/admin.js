import words from './admin.it.json' with { type: 'json' };

export const adminText = (key) => words[key] ?? key;
