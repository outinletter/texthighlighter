/**
 * Cloudflare Pages Function - AI Briefing
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (CF-OPTIMIZED)
당신은 베테랑 항공운항 AI 코파일럿입니다. 반드시 한국어로 작성하고, 리스크 등급에 따라 🔴, 🟠, 🟡, 🟢 이모지를 사용하십시오.
`;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // 1. 바인딩 상태 확인 및 상세 에러 출력
    if (!env.AI) {
      return new Response(JSON.stringify({
        error: 'AI Binding missing',
        details: 'Go to Settings -> Functions -> AI Bindings in Pages Dashboard and add "AI" binding.'
      }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const ofpText = body.ofpText || '';
    if (!ofpText.trim()) throw new Error('No flight documents provided.');

    // 2. 가장 안정적인 모델로 호출 (llama-3-8b-instruct)
    const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
        { role: 'user', content: `Analyze document and output in CARD VIEW format:\n\n${ofpText.slice(0, 20000)}` }
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
    return new Response(JSON.stringify({ error: 'AI Execution Error', details: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
