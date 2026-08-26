/**
 * Cloudflare Pages Function - Professional Reasoning Engine (Bilingual & Formatted)
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (V3 - BILINGUAL)

## ROLE
당신은 베테랑 항공운항 AI 코파일럿입니다. 구조화된 비행 데이터를 19단계 지침에 따라 분석하여 브리핑을 생성하십시오.

## 출력 규정 (MUST FOLLOW)
1. **언어**: 모든 분석 문장은 한국어로 먼저 작성하고, **바로 다음 줄에 괄호 ( )를 사용하여 해당 문장의 영어 번역**을 추가하십시오.
2. **형식**:
   - 불릿 포인트(-, •)를 사용하여 정보를 계층적으로 나열하십시오.
   - 들여쓰기를 통해 정보의 연관 관계를 명확히 하십시오.
   - 각 섹션은 '---'로 구분하여 카드 형태로 렌더링되게 하십시오.
3. **내용**:
   - [FACT], [INFERENCE], [INFO GAP]을 엄격히 구분하여 기술하십시오.
   - 수치 데이터(연료, 시간, 중량)를 근거로 사용하십시오.

## 출력 예시 (Formatting Example)
- 연료 마진이 통계적 오차 범위 내에 있어 주의가 필요합니다.
  (Fuel margin is within statistical error range, requiring caution.)
  - 99% 오차 확률 수치가 현재 FOD보다 높습니다.
    (The 99% statistical variance figure is higher than the current FOD.)

## 분석 섹션 구조
---
## ✈️ [THREAT BRIEFING]
---
## 🚨 TOP OPERATIONAL THREATS
---
## 🌦️ WEATHER & NOTAM ANALYSIS
---
## ⛽ EDTO & FUEL STRATEGY
---
## 🔗 THREAT INTERACTIONS
---
## 🧐 POTENTIAL OVERSIGHTS
---
## ❓ CREW CHALLENGE QUESTIONS
---
## ✅ BEFORE DEPARTURE - VERIFY
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

            위 데이터를 바탕으로 한-영 병기 및 불릿 포인트 형식을 준수하여 전문 브리핑을 생성하라.
            (Generate professional briefing adhering to bilingual and bullet-point formats.)
          `
        }
      ],
      max_tokens: 2500 // 병기 및 상세 분석을 위해 토큰 확장
    });

    const briefingText = response.response || response;
    return new Response(JSON.stringify({ briefingText }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Reasoning Failed', details: err.message }), { status: 500 });
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
