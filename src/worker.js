/**
 * Cloudflare Worker - AI Flight Safety Analysis
 * Improved routing and CORS support to fix HTTP 405.
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (CF-OPTIMIZED)
당신은 베테랑 항공운항 AI 코파일럿입니다. 제공된 비행 서류를 분석하여 모바일에 최적화된 카드 브리핑을 작성하십시오.
반드시 한국어로 작성하고, 리스크 등급에 따라 🔴, 🟠, 🟡, 🟢 이모지를 사용하십시오.
각 섹션은 '---'로 구분하십시오.
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, ''); // 끝에 붙은 / 제거하여 통일

    // API Endpoint: /api/briefing
    if (path === '/api/briefing') {
      // OPTIONS 요청 처리 (CORS)
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        });
      }

      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: `Method ${request.method} Not Allowed. Please use POST.` }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        if (!env.AI) {
          throw new Error('Worker AI binding is missing in Cloudflare Dashboard.');
        }

        const body = await request.json();
        const ofpText = body.ofpText || '';
        if (!ofpText.trim()) throw new Error('No flight document text provided.');

        const trimmedText = ofpText.slice(0, 25000);

        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
            { role: 'user', content: `Analyze document and output in CARD VIEW format:\n\n${trimmedText}` }
          ]
        });

        let briefingText = response.response || response;
        if (typeof briefingText !== 'string') briefingText = JSON.stringify(briefingText);

        return new Response(JSON.stringify({ briefingText }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });

      } catch (err) {
        return new Response(JSON.stringify({
          error: 'AI Analysis Failed',
          details: err.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // Default: Serve static assets
    return env.ASSETS.fetch(request);
  }
};
