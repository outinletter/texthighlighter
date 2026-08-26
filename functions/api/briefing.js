/**
 * Cloudflare Pages Function - AI Briefing (Final Optimized)
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (CF-OPTIMIZED)
당신은 베테랑 항공운항 AI 코파일럿입니다. 제공된 비행 서류를 분석하여 모바일에 최적화된 카드 브리핑을 작성하십시오.
반드시 한국어로 작성하고, 리스크 등급에 따라 🔴, 🟠, 🟡, 🟢 이모지를 사용하십시오.
각 섹션은 '---'로 구분하십시오.
`;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // 1. AI 바인딩 체크 (Settings -> Functions -> Bindings 에 "AI" 가 있어야 함)
    if (!env.AI) {
      return new Response(JSON.stringify({
        error: 'AI Binding Missing',
        details: 'Cloudflare Pages Dashboard -> Settings -> Functions -> Bindings 섹션에서 Workers AI를 "AI"라는 이름으로 추가해 주세요.'
      }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const ofpText = body.ofpText || '';
    if (!ofpText.trim()) throw new Error('입력된 비행 서류 텍스트가 없습니다.');

    // 2. AI 실행 (가장 최신의 llama-3.1-8b 모델 사용)
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
        { role: 'user', content: `다음 비행 서류를 분석하여 카드 뷰 형식으로 브리핑을 생성해줘:\n\n${ofpText.slice(0, 25000)}` }
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
    return new Response(JSON.stringify({
      error: 'AI 실행 중 오류 발생',
      details: err.message
    }), {
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
