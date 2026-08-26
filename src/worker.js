/**
 * Cloudflare Worker - AI Flight Safety Analysis
 * Priority routing for API endpoints.
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (CF-OPTIMIZED)
당신은 베테랑 항공운항 AI 코파일럿입니다. 제공된 비행 서류를 분석하여 모바일에 최적화된 카드 브리핑을 작성하십시오.
반드시 한국어로 작성하고, 리스크 등급에 따라 🔴, 🟠, 🟡, 🟢 이모지를 사용하십시오.
각 섹션은 '---'로 구분하십시오.
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. API 요청을 최우선으로 처리
    if (url.pathname.endsWith('/api/briefing')) {
      // CORS 및 OPTIONS 처리
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        });
      }

      if (request.method === 'POST') {
        try {
          if (!env.AI) throw new Error('AI Binding missing.');
          const body = await request.json();
          const ofpText = body.ofpText || '';

          const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
              { role: 'user', content: `Analyze document:\n\n${ofpText.slice(0, 25000)}` }
            ]
          });

          const briefingText = response.response || response;
          return new Response(JSON.stringify({ briefingText }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: 'AI Error', details: err.message }), {
            status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      }

      // POST가 아닐 경우 405 반환
      return new Response('Method Not Allowed', { status: 405 });
    }

    // 2. 그 외 요청은 정적 자산(index.html 등) 서빙
    return env.ASSETS.fetch(request);
  }
};
