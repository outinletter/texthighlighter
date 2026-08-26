/**
 * Cloudflare Worker - AI Flight Safety Analysis
 * Uses Cloudflare Workers AI directly for analysis.
 */

const BRIEFING_SYSTEM_PROMPT = `# FLIGHT SAFETY THREAT ANALYSIS ENGINE (CF-OPTIMIZED)

## 1. ROLE & OBJECTIVE
You are an aviation operational risk analysis assistant. Your goal is to analyze flight documents and generate a mobile-optimized 'Card View' safety briefing.

## 2. ANALYSIS PRINCIPLES
- Strictly distinguish between [FACT], [INFERENCE], and [INFO GAP].
- Be concise and focus on data.
- Analyze 'Threat Interactions' (e.g., Weather + Fuel).
- Identify 'Blind Spots' (What could be missed?).

## 3. RISK VISUALIZATION (Traffic Light System)
Use these emojis for risk levels:
- 🔴 CRITICAL: Immediate/Severe impact
- 🟠 HIGH: Requires crew attention/mitigation
- 🟡 MEDIUM: Monitoring required
- 🟢 LOW: General caution
- 🟣 INFO GAP: Missing information

## 4. ANALYSIS SCOPE
- EDTO: Suitability, ETP timing, Critical Fuel.
- FUEL: Planned vs Historical, Contingency, EDTO margin.
- MEL/CDL: Impact on performance, fuel, and routing.
- WEATHER: DEP/ENRT/DEST/ALTN threats (Turbulence, CB, etc.).
- NOTAM: Runway, Approach, Nav, GNSS availability.

## 5. FINAL OUTPUT FORMAT: MOBILE CARD VIEW
Return the analysis in EXACTLY this Markdown structure, using '---' as card separators. Write in KOREAN.

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
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API Endpoint for AI Briefing
    if (url.pathname === '/api/briefing' && request.method === 'POST') {
      try {
        const body = await request.json();
        const ofpText = body.ofpText || '';

        if (!ofpText.trim()) {
          return new Response(JSON.stringify({ error: 'No text provided' }), { status: 400 });
        }

        // Limit text length for AI context window
        const trimmedText = ofpText.slice(0, 50000);

        // Run Cloudflare Workers AI
        const response = await env.AI.run('@cf/meta/llama-3.1-70b-instruct', {
          messages: [
            { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
            { role: 'user', content: `Analyze this flight document and generate the Card View briefing:\n\n${trimmedText}` }
          ]
        });

        // The response format depends on the model, but usually it's { response: "..." }
        const briefingText = response.response || response;

        return new Response(JSON.stringify({ briefingText }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'AI Analysis Failed', details: err.message }), { status: 500 });
      }
    }

    // Default: Serve static assets
    return env.ASSETS.fetch(request);
  }
};
