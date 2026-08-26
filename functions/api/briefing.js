/**
 * Cloudflare Pages Function - AI Briefing (Fixed Model Issue)
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE
You are an aviation operational risk analysis assistant. Analyze flight documents and identify safety-critical threats.
Strictly use [FACT], [INFERENCE], [INFO GAP]. Analyze INTERACTIONS between threats.
Write in KOREAN. Output in CARD VIEW (separated by '---').
`;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.AI) throw new Error('AI Binding Missing');

    const body = await request.json();
    const ofpText = body.ofpText || '';
    if (!ofpText.trim()) throw new Error('No text provided.');

    // 고성능 70B 모델을 직접 지정하여 Deprecation 이슈 해결 및 분석 능력 극대화
    const response = await env.AI.run('@cf/meta/llama-3.1-70b-instruct', {
      messages: [
        { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
        { role: 'user', content: `Analyze this flight package and provide a comprehensive threat briefing following all safety analysis rules:\n\n${ofpText.slice(0, 30000)}` }
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
    return new Response(JSON.stringify({ error: 'Analysis Error', details: err.message }), {
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
