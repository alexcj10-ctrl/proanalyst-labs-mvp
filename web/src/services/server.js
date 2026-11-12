export async function serverRequest(action, body, idempotencyKey) {
  const response = await fetch(`/api/${action}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({ error: 'Service unavailable' }));
  if (!response.ok) throw new Error(data.error || 'Service unavailable');
  return data;
}

export async function recordEvent(action, body, idempotencyKey) {
  const data = await serverRequest(action, body, idempotencyKey);
  if (data.status !== 'recorded' || !data.id) throw new Error('The server did not confirm saving.');
  return data;
}
