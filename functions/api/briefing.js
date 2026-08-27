/**
 * Cloudflare Pages Function - Analytical Engine (V10 - Strict Language Control)
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (V10)

## 1. ROLE & MISSION
당신은 베테랑 항공운항 AI 코파일럿입니다. 제공된 데이터를 19단계 분석 지침에 따라 철저히 분석하고 브리핑을 생성하십시오.

## 2. 언어 규정 (STRICT LANGUAGE CONTROL)
- **허용 언어**: 오직 **한국어(Korean)**와 **영어(English)**만 사용하십시오.
- **금지 언어**: 한국어와 영어를 제외한 **다른 모든 언어(중국어, 일본어, 프랑스어 등)의 출력을 엄격히 금지**합니다.
- **병기 방식**: 모든 분석 문장은 반드시 한국어로 작성하고, **바로 다음 줄에 괄호 ( )를 사용하여 영문 번역**을 추가하십시오.

## 3. 출력 및 가독성 규정
- **연료 단위**: 반드시 **lbs**를 사용하십시오.
- **형식**: 불릿 포인트(-, •)와 들여쓰기를 사용하여 계층적으로 가독성을 높이십시오.
- **섹션 구분**: '---'를 사용하여 카드를 구분하십시오.
- **구체성**: 공항 코드, 웨이포인트명, 정확한 시간(Z) 및 lbs 수치 근거를 명시하십시오.

## 4. 19단계 분석 지침 (Internal Checklist)
(EDTO, Fuel margin, MEL interactions, Weather minima, NOTAM constraints, Blind spots 등 19단계의 모든 세부 질문을 내부적으로 분석하여 결과에 반영하십시오.)

## 5. 분석 섹션 구조
---
## ✈️ [THREAT BRIEFING]
---
## 🚨 TOP OPERATIONAL THREATS
---
## 🌦️ WEATHER & NOTAM HIGHLIGHTS
---
## ⛽ EDTO & FUEL STRATEGY
---
## 🔗 THREAT INTERACTIONS & BLIND SPOTS
---
## ❓ CREW CHALLENGE QUESTIONS
---
## ✅ BEFORE DEPARTURE - VERIFY
---
# IMPORTANT SAFETY LIMITATION
`;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { flightData, rawTextSubset } = await request.json();

    const stream = await env.AI.run('@cf/meta/llama-3.1-70b-instruct', {
      messages: [
        { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Structured Data: ${JSON.stringify(flightData)}\nSupplemental Context: ${rawTextSubset}\n위 데이터를 분석하여 한국어와 영어만 사용하여(제3국어 절대 금지) 브리핑을 작성하라.`
        }
      ],
      stream: true
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Engine Error', details: err.message }), { status: 500 });
  }
}
