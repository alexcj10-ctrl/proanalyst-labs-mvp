import { errorText } from '../i18n/index.js';

// Session credentials stay in HttpOnly cookies. The CSRF token is held only in memory.
let csrfToken = '';
let authenticationRevision = 0;
export const getCsrfToken = () => csrfToken;

export async function serverRequest(action, body, idempotencyKey) {
  if (action === 'login' || action === 'logout') authenticationRevision++;
  const revision = authenticationRevision;
  let response;
  try { response = await fetch(`/api/${action}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...(body !== undefined && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }); } catch { throw new Error(errorText('Network error')); }
  const data = await response.json().catch(() => ({ error: 'Service unavailable' }));
  if (!response.ok) {
    if (response.status === 403 && (action.startsWith('admin-') || action === 'insights' || action === 'logout')) {
      csrfToken = '';
      window.dispatchEvent(new Event('proanalyst-session-expired'));
    }
    throw Object.assign(new Error(errorText(data.error || 'Service unavailable')), { status: response.status });
  }
  if ((action === 'login' || action === 'session') && revision === authenticationRevision) {
    csrfToken = data.role === 'admin' && data.admin === true && typeof data.csrfToken === 'string' ? data.csrfToken : '';
  }
  if (action === 'logout') csrfToken = '';
  return data;
}

export async function recordEvent(action, body, idempotencyKey) {
  const data = await serverRequest(action, body, idempotencyKey);
  if (data.status !== 'recorded' || !data.id) throw new Error(errorText('The server did not confirm saving.'));
  return data;
}
