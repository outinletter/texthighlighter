/**
 * Cloudflare Pages Function - Professional Reasoning Engine
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (REASONER)

## ROLE
당신은 구조화된 비행 데이터와 텍스트를 입력받아 19단계 안전 지침에 따라 위협을 추론하는 전문가입니다.
단순 요약이 아니라, 데이터 간의 '모순'과 '위험'을 찾아내는 것이 목표입니다.

## 핵심 분석 로직 (19단계 지침 기반)
1. **EDTO 매칭**: ETP 도달 시간(Z)이 해당 공항의 Suitability Window(From-To) 내에 있는지 확인하십시오.
2. **연료 마진**: Critical Fuel vs FOB의 차이가 통계적 오차(90/99%)보다 작은지 분석하십시오.
3. **복합 위협**: MEL 항목이 오늘 기상(Turbulence, Visibility)과 결합될 때의 위험을 추론하십시오.
4. **사각지대**: 수치상 정상이나 시간 압박이나 기상 악화 시 Plan Continuation Bias가 발생할 지점을 찾으십시오.

## 출력 형식 (카드 뷰)
- [THREAT BRIEFING]을 가장 상단에 배치하십시오.
- 모든 위협에는 근거가 되는 수치([FACT])를 명시하십시오.
- 한국어로 작성하고 🔴, 🟠 이모지를 적절히 사용하십시오.
`;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { flightData, rawTextSubset } = await request.json();

    const response = await env.AI.run('@cf/meta/llama-3.1-70b-instruct', {
      messages: [
        { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `
            [STRUCTURED DATA]: ${JSON.stringify(flightData)}
            [SUPPLEMENTAL TEXT]: ${rawTextSubset}

            위 데이터를 바탕으로 19단계 지침에 따라 전문적인 안전 브리핑을 생성하라.
          `
        }
      ]
    });

    const briefingText = response.response || response;
    return new Response(JSON.stringify({ briefingText }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Reasoning Failed', details: err.message }), { status: 500 });
  }
}
