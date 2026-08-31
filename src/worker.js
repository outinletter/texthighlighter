import { onRequestPost as handleBriefing } from '../functions/api/briefing.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/briefing') {
      if (request.method === 'POST') {
        return handleBriefing({ request, env, ctx });
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    return env.ASSETS.fetch(request);
  }
};
