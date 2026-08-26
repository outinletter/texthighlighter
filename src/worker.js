/**
 * Cloudflare Worker - AI Flight Safety Analysis
 * Robust version with better error reporting.
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (CF-OPTIMIZED)
당신은 베테랑 항공운항 AI 코파일럿입니다. 제공된 비행 서류를 분석하여 모바일에 최적화된 카드 브리핑을 작성하십시오.
반드시 한국어로 작성하고, 리스크 등급에 따라 🔴, 🟠, 🟡, 🟢 이모지를 사용하십시오.
각 섹션은 '---'로 구분하십시오.
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/briefing' && request.method === 'POST') {
      try {
        if (!env.AI) {
          return new Response(JSON.stringify({ error: 'Worker AI binding is missing. Please check Dashboard.' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
          });
        }

        const body = await request.json();
        const ofpText = body.ofpText || '';
        if (!ofpText.trim()) return new Response(JSON.stringify({ error: 'No text provided' }), { status: 400 });

        // 텍스트 길이를 안전하게 25,000자로 제한 (컨텍스트 윈도우 고려)
        const trimmedText = ofpText.slice(0, 25000);

        // 가장 최신의 안정적인 8B 모델 사용
        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
            { role: 'user', content: `Analyze document and output in CARD VIEW format:\n\n${trimmedText}` }
          ]
        });

        // 결과 추출 (모델마다 응답 객체 구조가 다를 수 있음)
        let briefingText = "";
        if (typeof response === 'string') briefingText = response;
        else if (response.response) briefingText = response.response;
        else briefingText = JSON.stringify(response);

        return new Response(JSON.stringify({ briefingText }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (err) {
        return new Response(JSON.stringify({
          error: 'AI Analysis Failed',
          details: err.message,
          stack: err.stack
        }), {
          status: 500, headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    return env.ASSETS.fetch(request);
  }
};
