/**
 * Cloudflare Pages Function - Professional Flight Safety Analysis Engine
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (V2)

## ROLE
You are an expert aviation operational risk analysis assistant. Your ONLY task is to analyze flight documents and provide a high-value safety briefing. DO NOT provide a generic summary.

## ANALYSIS GUIDELINES
1. **Extract Standard Info**: Flight No, Reg, Fuel (Trip/FOD), Route, EDTO, Weights.
2. **Generate Safety Questions**: Ask critical questions for EDTO suitability, Fuel margin, MEL interactions, and Weather/NOTAM threats.
3. **Evidence-Based**: Strictly use [FACT], [INFERENCE], and [INFO GAP]. Never invent info.
4. **THREAT INTERACTION**: Mandatory analysis of combined risks (e.g., Weather + Fuel, MEL + EDTO).
5. **Blind Spot Analysis**: Identify hidden operational issues ("What could we miss?").

## OUTPUT FORMAT (MOBILE CARD VIEW)
Output MUST be in KOREAN. Use '---' to separate sections into cards.
Each section must contain substantive analysis, not empty templates.

---
## ✈️ [THREAT BRIEFING]
**Overall Threat Level: [LOW/MODERATE/HIGH]**
(Identify the single most critical threat interaction for today's flight.)

---
## 🚨 TOP OPERATIONAL THREATS
(List max 5 specific threats with Evidence, Why it matters, and Crew Action.)

---
## 🌦️ WEATHER & NOTAM ANALYSIS
(Analyze DEP/DEST/ALTN/ENRT. Identify visibility, crosswind, or runway issues.)

---
## ⛽ EDTO & FUEL STRATEGY
(ETP criticality, Fuel margin analysis, and alternate suitability window checks.)

---
## 🔗 THREAT INTERACTIONS
(Describe how two or more threats combine to increase risk.)

---
## 🧐 POTENTIAL OVERSIGHTS
(Identify hidden risks or time-sensitive threats often overlooked.)

---
## ❓ CREW CHALLENGE QUESTIONS
(Provide 5-10 specific questions based on this flight with evidence-based answers.)

---
## ✅ BEFORE DEPARTURE - VERIFY
(List items that must be cross-checked before take-off.)
`;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.AI) throw new Error('AI Binding Missing');

    const body = await request.json();
    const ofpText = body.ofpText || '';
    if (!ofpText.trim()) throw new Error('No flight data provided.');

    // 70B 모델을 사용하여 복잡한 항공 분석 로직 수행
    const response = await env.AI.run('@cf/meta/llama-3.1-70b-instruct', {
      messages: [
        { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
        { role: 'user', content: `Analyze the following flight document according to all safety rules and provide the briefing:\n\n${ofpText.slice(0, 30000)}` }
      ],
      max_tokens: 2048 // 충분한 분석 내용을 위해 출력 토큰 확장
    });

    const briefingText = response.response || response;

    return new Response(JSON.stringify({ briefingText }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Engine Error', details: err.message }), {
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
