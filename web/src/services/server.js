import { errorText } from '../i18n/index.js';

export async function serverRequest(action, body, idempotencyKey) {
  let response;
  try { response = await fetch(`/api/${action}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }); } catch { throw new Error(errorText('Network error')); }
  const data = await response.json().catch(() => ({ error: 'Service unavailable' }));
  if (!response.ok) throw new Error(errorText(data.error || 'Service unavailable'));
  return data;
}

export async function recordEvent(action, body, idempotencyKey) {
  const data = await serverRequest(action, body, idempotencyKey);
  if (data.status !== 'recorded' || !data.id) throw new Error(errorText('The server did not confirm saving.'));
  return data;
}
