/**
 * Cloudflare Worker - AI Flight Safety Analysis
 * Updated to use a more stable model for free-tier compatibility.
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (CF-OPTIMIZED)
(중략 - 이전과 동일한 시스템 프롬프트 내용 유지)
...
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/briefing' && request.method === 'POST') {
      try {
        // AI 바인딩 확인
        if (!env.AI) {
          return new Response(JSON.stringify({ error: 'AI Binding missing in Cloudflare Dashboard' }), { status: 500 });
        }

        const body = await request.json();
        const ofpText = body.ofpText || '';
        if (!ofpText.trim()) return new Response(JSON.stringify({ error: 'No text provided' }), { status: 400 });

        const trimmedText = ofpText.slice(0, 30000);

        // 더 안정적인 8B 모델로 변경
        const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: [
            { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
            { role: 'user', content: `Analyze document:\n\n${trimmedText}` }
          ]
        });

        const briefingText = response.response || response;
        return new Response(JSON.stringify({ briefingText }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.error('Worker AI Error:', err.message);
        return new Response(JSON.stringify({ error: 'AI Analysis Failed', details: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    return env.ASSETS.fetch(request);
  }
};
