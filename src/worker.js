```javascript
/**
 * Cloudflare Worker
 * - 정적 자산(HTML/JS/CSS/폰트 등)은 Assets 바인딩으로 그대로 서빙
 * - POST /api/briefing 요청만 Gemini API를 호출해 한국어 비행 안전 브리핑(Critical Threat)을 생성
 *
 * 배포 전 필요 작업 (직접 실행):
 *   wrangler secret put GEMINI_API_KEY
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (CF-OPTIMIZED)

## 1. 정체성 및 목적
당신은 항공사의 운항 승무원을 위한 '항공 안전 위협 분석 엔진'입니다.
당신의 목표는 방대한 비행 문서를 분석하여, 모바일/태블릿 화면에서 한눈에 파악 가능한 '카드 형태의 안전 브리핑'을 생성하는 것입니다.

## 2. 분석 원칙
- [FACT], [INFERENCE], [INFO GAP]을 엄격히 구분하십시오.
- 불필요한 서술은 배제하고, 핵심 데이터 중심으로 기술하십시오.
- 모든 위협은 '상호작용(Interaction)' 관점에서 한 번 더 검토하십시오.

## 3. 리스크 등급 시각화 (Traffic Light System)
각 카드와 위협 항목에 다음 이모지를 사용하여 리스크를 즉시 인지하게 하십시오:
- 🔴 CRITICAL: 즉각적/심각한 영향
- 🟠 HIGH: 반드시 브리핑 및 대응 필요
- 🟡 MEDIUM: 지속적 모니터링 필요
- 🟢 LOW: 일반적 주의사항
- 🟣 INFO GAP: 정보 부재로 확인 불가

## 4. 분석 프로세스 및 항목
### A. 데이터 추출 (Flight Info, Route, EDTO, Fuel, MEL/CDL)
- 모든 수치는 문서의 용어와 맥락을 따르되, 지어내지 마십시오.
- [INFO GAP]: 정보가 없는 경우 명시하십시오.

### B. 분야별 정밀 분석
1. **EDTO**: Alternate Suitability Window 확인, ETP 시점 도착 가능성, Critical Fuel Scenario 분석.
2. **FUEL**: Planned vs Actual/Historical 차이, Contingency 적절성, EDTO Fuel Margin.
3. **MEL/CDL**: 성능/연료/날씨 회피/EDTO에 미치는 영향 분석. [INFO GAP — REFER TO MEL/CDL PROCEDURE] 사용 가능.
4. **WEATHER**: DEP/DEST/ALTN/ENRT(Turbulence, CB, Icing, Jetstream)별 위협 도출.
5. **NOTAM**: Runway/Taxiway/Approach/NAV/GNSS 등 운항 가용성에 직접적인 영향을 주는 항목 선별.

### C. 위협 상호작용 (Interaction) 분석
- Weather + Fuel, MEL + EDTO, NOTAM + Low Visibility 등 복합적인 위험 시나리오를 식별하십시오.

### D. 사각지대 (What could we miss?)
- 정상적으로 보이지만 숨겨진 시간 민감형 위협이나 다중 위협의 결합을 찾아내십시오.

## 5. [중요] FINAL OUTPUT FORMAT: MOBILE CARD VIEW
출력은 반드시 아래의 Markdown 카드 구조를 따르십시오. 각 섹션은 '---'로 구분된 하나의 '카드'입니다. 한국어로 작성하십시오.

---
## 📱 FLIGHT SAFETY DASHBOARD
**[Overall Risk: 🔴/🟠/🟡/🟢]**
*(짧은 총평 1~2문장)*

---
### ✈️ CARD 1: FLIGHT OVERVIEW
- **Flight/AC**: [Flight No] / [Reg] ([Type])
- **Route**: [DEP] -> [DEST] ([Route 요약])
- **Fuel/Endur**: FOD [Value] / [Endurance]
- **EDTO/MEL**: [Brief Status]

---
### 🚨 CARD 2: TOP THREATS (Max 3-5)
> **[Risk Emoji] [Threat Name]**
> - **Why**: [Evidence & Reason]
> - **Consequence**: [Potential Result]
> - **Action**: [Crew Attention Point]
---

---
### 🌦️ CARD 3: WEATHER & NOTAM HIGHLIGHTS
- **DEP**: [Status Emoji] [Core Threat]
- **ENRT**: [Status Emoji] [Turbulence/CB/Jetstream]
- **DEST**: [Status Emoji] [Approach/Visibility/RWY]
- **ALTN**: [Status Emoji] [Suitability/Weather]
---

---
### 🔗 CARD 4: THREAT INTERACTIONS (복합 위협)
- **Combo**: [Threat A] + [Threat B]
- **Effect**: [Combined Impact]
- **Mitigation**: [Recommended Action]
---

---
### ⛽ CARD 5: EDTO & FUEL MARGIN
- **Critical ETP**: [ETP No] ([Airport])
- **Suitability**: [Time Margin Status]
- **Fuel Margin**: [Critical Fuel vs FOB]
---

---
### 🧐 CARD 6: WHAT COULD WE MISS? (사각지대)
1. [Hidden Threat 1]
2. [Hidden Threat 2]
---

---
### ❓ CARD 7: CREW CHALLENGE QUESTIONS
*(승무원 간 상호 확인용 퀴즈)*
Q1: [Specific Question]?
> A: [Possible Answer/Evidence]

Q2: [Specific Question]?
> A: [Possible Answer/Evidence]
---

---
### ✅ CARD 8: PRE-DEPARTURE CHECKLIST
- [ ] [Must-Verify Item 1]
- [ ] [Must-Verify Item 2]
---

## 6. 주의사항
- 승무원의 판단을 대체하는 것이 아니라 의사결정을 지원하는 도구임을 명심하십시오.
- 문서에 없는 내용을 추측하지 마십시오.`;

async function handleBriefing(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server not configured (missing GEMINI_API_KEY)' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const ofpText = (body && typeof body.ofpText === 'string') ? body.ofpText : '';
  if (!ofpText.trim()) {
    return new Response(JSON.stringify({ error: 'ofpText is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 비용/지연 제어를 위해 입력 텍스트 길이 제한 (약 4만자 ≈ 대형 OFP+WX+NOTAM 커버 가능한 수준)
  const MAX_CHARS = 40000;
  const trimmedText = ofpText.length > MAX_CHARS ? ofpText.slice(0, MAX_CHARS) : ofpText;

  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: BRIEFING_SYSTEM_PROMPT }] },
        contents: [
          { role: 'user', parts: [{ text: `아래는 오늘 비행의 OFP/WX/NOTAM 원문 텍스트입니다:\n\n${trimmedText}` }] }
        ],
        generationConfig: { maxOutputTokens: 1500 }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: 'Gemini API error', detail: errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await geminiRes.json();
    const briefingText = ((data.candidates || [])[0]?.content?.parts || [])
      .map(p => p.text || '')
      .join('\n')
      .trim();

    if (!briefingText) {
      return new Response(JSON.stringify({ error: 'Empty response from model' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ briefingText }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Request failed', detail: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/briefing') {
      return handleBriefing(request, env);
    }

    // 그 외 모든 요청은 정적 자산으로 서빙 (기존 Cloudflare Pages/Workers Assets 동작 유지)
    return env.ASSETS.fetch(request);
  }
};
```
