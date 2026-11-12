// Explicit capability boundary for future same-origin Vercel Functions.
// Enable each capability only after authentication, validation and durable storage exist.
export const serverFeatures = Object.freeze({
  staffLogin: { endpoint: '/api/login', method: 'POST', available: false },
  feedback: { endpoint: '/api/feedback', method: 'POST', available: false },
  scenarioRequests: { endpoint: '/api/scenario-requests', method: 'POST', available: false },
  insights: { endpoint: '/api/insights', method: 'GET', available: false },
});

export const SERVER_UNAVAILABLE = 'Not available yet. This service has not been activated; nothing has been sent.';
