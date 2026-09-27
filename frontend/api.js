/**Browser client for the WebPass NYC backend.

Exposes window.WebPassApi. Every call resolves to { ok, status, body } and
never throws for HTTP errors; a network failure resolves with status 0.

Which server it talks to:
    1. ?api=http://host:port in the page URL, if given.
    2. The page's own origin, when the backend is serving the page.
    3. http://localhost:3000 otherwise (for example the frontend's own dev server).
*/
(function () {
  'use strict';

  const FALLBACK_BASE_URL = 'http://localhost:3000';
  let baseUrlPromise = null;

  async function isBackend(origin) {
    try {
      const response = await fetch(`${origin}/health`, { cache: 'no-store' });
      const body = await response.json();
      return response.ok && body && body.status === 'ok';
    } catch (error) {
      return false;
    }
  }

  async function resolveBaseUrl() {
    const override = new URLSearchParams(window.location.search).get('api');
    if (override) {
      return override.replace(/\/+$/, '');
    }
    const origin = window.location.origin;
    if (origin.startsWith('http') && (await isBackend(origin))) {
      return origin;
    }
    return FALLBACK_BASE_URL;
  }

  /** The backend's address, worked out once per page load.

  Returns:
      Promise<string>: Base URL without a trailing slash.
  */
  function baseUrl() {
    if (!baseUrlPromise) {
      baseUrlPromise = resolveBaseUrl();
    }
    return baseUrlPromise;
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }
    let body = options.body;
    if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    }
    try {
      const response = await fetch(`${await baseUrl()}${path}`, { method: options.method || 'GET', headers, body });
      const parsed = await response.json().catch(() => null);
      return { ok: response.ok, status: response.status, body: parsed };
    } catch (error) {
      return { ok: false, status: 0, body: { errors: ['Cannot reach the KnowYork server. Is it running?'] } };
    }
  }

  /** The first error message in a response, for showing to the user.

  Args:
      result ({ body: Object }): A response from any call here.
      fallback (string): Message to use when the server gave none.

  Returns:
      string: A readable message.
  */
  function errorMessage(result, fallback) {
    const body = result.body || {};
    return (body.errors && body.errors[0]) || body.error || fallback;
  }

  /** Watch the live decision stream.

  Args:
      onEvent (function): Called with each { type, decisionId, message, createdAt }.

  Returns:
      Promise<EventSource>: The open stream. Call close() on it to stop.
  */
  async function subscribeEvents(onEvent) {
    const source = new EventSource(`${await baseUrl()}/events`);
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data));
      } catch (error) {
        /* ignore malformed events */
      }
    };
    return source;
  }

  window.WebPassApi = {
    baseUrl,
    errorMessage,
    subscribeEvents,
    health: () => request('/health'),
    getPlaces: () => request('/places'),
    refreshMissions: () => request('/missions/refresh', { method: 'POST', json: {} }),
    requestLoginCode: (email) => request('/auth/request-code', { method: 'POST', json: { email } }),
    verifyLoginCode: (email, code) => request('/auth/verify', { method: 'POST', json: { email, code } }),
    getMyStamps: (token) => request('/me/nft', { token }),
    getMyBalance: (token) => request('/me/rlusd-balance', { token }),
    getMyTransactions: (token) => request('/me/transactions', { token }),
    submitVisit: (form) => request('/submissions', { method: 'POST', body: form }),
    getDecision: (decisionId) => request(`/decisions/${encodeURIComponent(decisionId)}`),
    setAttackMode: (enabled) => request('/test/attack', { method: enabled ? 'POST' : 'DELETE' }),
    forceProposal: (recipient, amount, reason) =>
      request('/test/attack/force-proposal', { method: 'POST', json: { recipient, amount, reason } }),
    clearForcedProposal: () => request('/test/attack/force-proposal', { method: 'DELETE' }),
  };
})();
