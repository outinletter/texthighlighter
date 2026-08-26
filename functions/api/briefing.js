/**
 * Cloudflare Pages Function - AI Briefing (128k Context Support)
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

    // 1. 모델을 128k 컨텍스트를 지원하는 llama-3.1-8b-instruct로 변경
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
        { role: 'user', content: `Analyze this flight package and provide a comprehensive threat briefing following all safety analysis rules:\n\n${ofpText}` }
      ]
    });

    const briefingText = response.response || response;
    return new Response(JSON.stringify({ briefingText }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
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
