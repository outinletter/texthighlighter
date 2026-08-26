/**
 * Cloudflare Pages Function - AI Briefing V4 (Streaming & Precise)
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (V4)

## 1. 절대 규칙 (CRITICAL RULES)
- **모호한 표현 금지**: '주의가 필요함', '일부 구간', '제한 사항 있음' 등 구체적 근거 없는 문장은 절대 쓰지 마십시오.
- **수치 중심 서술**: 모든 위협 문장에는 반드시 **공항 코드(예: RKSI), 웨이포인트(예: KEOLA), 시각(예: 2305Z), 연료량(예: 1.25)** 중 하나 이상의 구체적 데이터가 포함되어야 합니다.
- **한-영 병기**: [한국어 문장] 바로 다음 줄에 [(English Translation)]을 배치하십시오.
- **단순한 구조**: 불필요한 마크다운 장식(**)을 최소화하여 가독성과 파싱 속도를 높이십시오.

## 2. 분석 가이드라인
- [FACT], [INFERENCE]를 수치 기반으로 도출하십시오.
- 데이터가 불충분하여 추론이 불가능한 섹션은 제목만 남기지 말고 아예 출력에서 제외하십시오.

## 3. 출력 섹션 (카드 구분: ---)
---
## [THREAT BRIEFING]
---
## TOP OPERATIONAL THREATS
---
## WEATHER & NOTAM ANALYSIS
---
## EDTO & FUEL STRATEGY
---
## CREW CHALLENGE QUESTIONS
`;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { flightData, rawTextSubset } = await request.json();

    // 스트리밍 모드로 AI 실행 (응답 속도 극대화)
    const stream = await env.AI.run('@cf/meta/llama-3.1-70b-instruct', {
      messages: [
        { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Data: ${JSON.stringify(flightData)}\nText: ${rawTextSubset}\n위 데이터를 바탕으로 수치 중심의 정밀 브리핑을 생성하라.`
        }
      ],
      stream: true // 스트리밍 활성화
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
