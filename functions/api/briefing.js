/**
 * Cloudflare Pages Function - AI Briefing
 * Handles POST /api/briefing
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (CF-OPTIMIZED)
당신은 베테랑 항공운항 AI 코파일럿입니다. 제공된 비행 서류를 분석하여 모바일에 최적화된 카드 브리핑을 작성하십시오.
반드시 한국어로 작성하고, 리스크 등급에 따라 🔴, 🟠, 🟡, 🟢 이모지를 사용하십시오.
각 섹션은 '---'로 구분하십시오.
`;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.AI) {
      return new Response(JSON.stringify({ error: 'AI Binding missing in Pages settings.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const ofpText = body.ofpText || '';
    if (!ofpText.trim()) throw new Error('No text provided.');

    // AI 실행
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
        { role: 'user', content: `Analyze document and output in CARD VIEW format:\n\n${ofpText.slice(0, 25000)}` }
      ]
    });

    const briefingText = response.response || response;

    return new Response(JSON.stringify({ briefingText }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'AI Error', details: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

// OPTIONS 요청 처리 (CORS)
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
