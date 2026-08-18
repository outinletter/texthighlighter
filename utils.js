/**
 * utils.js - Helper functions for PDF processing and drawing
 */

const TEST_KEYWORDS = ["NOTAM", "PACKAGE", "PLAN", "FLIGHT", "KOREAN", "RELEASE", "WEATHER", "AIR", "ROUTE", "ALTN", "INFO"];
const OFFSETS_TO_TEST = [0, 29, -29, 32, -32];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(src);
    s.onerror = () => reject(new Error('Failed to load: ' + src));
    document.head.appendChild(s);
  });
}

function detectPageOffset(rawText) {
  if (!rawText) return 0;
  let bestOffset = 0;
  let bestMatches = 0; 
  const sampleLen = Math.min(rawText.length, 1500);
  
  for (const offset of OFFSETS_TO_TEST) {
    let decodedSample = "";
    for (let j = 0; j < sampleLen; j++) {
      decodedSample += String.fromCharCode(rawText.charCodeAt(j) + offset);
    }
    const cleanSample = decodedSample.replace(/[^A-Za-z0-9\s]/g, ' ').toUpperCase();
    let matchCount = 0;
    for (const kw of TEST_KEYWORDS) {
      if (cleanSample.includes(kw)) matchCount++;
    }
    if (matchCount >= 3) return offset;
    if (matchCount > bestMatches) {
      bestMatches = matchCount;
      bestOffset = offset;
    }
  }
  
  if (bestMatches > 0) return bestOffset;
  
  for (let i = -120; i <= 120; i++) {
    if (OFFSETS_TO_TEST.includes(i)) continue;
    let decodedSample = "";
    for (let j = 0; j < sampleLen; j++) {
      decodedSample += String.fromCharCode(rawText.charCodeAt(j) + i);
    }
    const cleanSample = decodedSample.replace(/[^A-Za-z0-9\s]/g, ' ').toUpperCase();
    let matchCount = 0;
    for (const kw of TEST_KEYWORDS) {
      if (cleanSample.includes(kw)) matchCount++;
    }
    if (matchCount > bestMatches) {
      bestMatches = matchCount;
      bestOffset = i;
    }
    if (bestMatches >= 3) break;
  }
  
  return bestOffset;
}

function decodeStr(str, offset) {
  if (!offset || !str) return str;
  let decoded = "";
  for (let i = 0; i < str.length; i++) {
    decoded += String.fromCharCode(str.charCodeAt(i) + offset);
  }
  return decoded;
}

function cleanAndDecodeItem(str, offset) {
  if (!str) return '';
  let finalStr = str;
  if (offset) {
    const origStandardCount = (str.match(/[A-Z0-9\s\/\.\-\(\)]/ig) || []).length;
    const decrypted = decodeStr(str, offset);
    const decStandardCount = (decrypted.match(/[A-Z0-9\s\/\.\-\(\)]/ig) || []).length;
    
    if (decStandardCount > origStandardCount) {
      finalStr = decrypted;
    }
  }
  return finalStr.replace(/[^A-Za-z0-9\s\/\.\-\(\)]/g, ' ');
}

function decodeForTagScan(str, offset) {
  if (!str) return '';
  let finalStr = str;
  if (offset) {
    const origStandardCount = (str.match(/[A-Z0-9\s\/\.\-\(\)]/ig) || []).length;
    const decrypted = decodeStr(str, offset);
    const decStandardCount = (decrypted.match(/[A-Z0-9\s\/\.\-\(\)]/ig) || []).length;
    if (decStandardCount > origStandardCount) {
      finalStr = decrypted;
    }
  }
  return finalStr.replace(/[^\x20-\x7E]/g, ' ');
}

function groupItemsIntoLines(items, offset) {
  const decorated = items
    .map(it => ({ item: it, text: decodeForTagScan(it.str, offset) }))
    .filter(d => d.text && d.text.length > 0);

  decorated.sort((a, b) => b.item.transform[5] - a.item.transform[5]);

  const lines = [];
  for (const d of decorated) {
    const y = d.item.transform[5];
    let joined = false;
    for (const line of lines) {
      if (Math.abs(line.y - y) < 4.0) {
        line.parts.push(d);
        joined = true;
        break;
      }
    }
    if (!joined) lines.push({ y, parts: [d] });
  }

  for (const line of lines) {
    line.parts.sort((a, b) => a.item.transform[4] - b.item.transform[4]);
    line.text = line.parts.map(p => p.text).join('');
  }
  return lines;
}

function checkKeywordMatch(text, kw) {
  const normalizedText = text.replace(/[^A-Za-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  let re;
  try {
    if (kw.toLowerCase() === 'restrict') {
      re = new RegExp(`\\b${escaped}[A-Za-z]*\\b`, 'i');
    } else {
      re = new RegExp(`\\b${escaped}\\b`, 'i');
    }
  } catch (e) {
    re = new RegExp(escaped, 'i');
  }
  return re.test(normalizedText);
}

// Draw a highlighted range box over text
function drawCharRangeHighlight(page, item, minCharIdx, maxCharIdx, sx, sy, pageOffset, color, opacity) {
  const s = cleanAndDecodeItem(item.str, pageOffset) || '';
  const tx = item.transform;
  const charW = (item.width || 0) / Math.max(s.length, 1);
  const itemH = Math.abs(tx[3]) || 10;
  page.drawRectangle({
    x: (tx[4] + minCharIdx * charW) * sx,
    y: tx[5] * sy - itemH * sy * 0.2,
    width: Math.max((maxCharIdx - minCharIdx + 1) * charW * sx, 4),
    height: Math.max(itemH * sy * 1.2, 8),
    color,
    opacity
  });
}

// Draw a styled badge with text (used for DISC, Duty Time, Suitable, etc.)
function drawAnnotatedBadge(page, text, font, x, y, scaleY, fontSize = 9, bgRgb = [1.0, 0.45, 0.65], fgRgb = [1, 1, 1], opacity = 0.85) {
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const padH = 4, padV = 2.5;
  const ascent = fontSize * 0.72;
  const descent = fontSize * 0.19;

  page.drawRectangle({
    x: x - padH,
    y: y - descent - padV,
    width: textWidth + padH * 2,
    height: ascent + descent + padV * 2,
    color: PDFLib.rgb(...bgRgb),
    opacity: opacity
  });

  page.drawText(text, {
    x: x,
    y: y,
    size: fontSize,
    font: font,
    color: PDFLib.rgb(...fgRgb),
    opacity: 1.0
  });
}

function parseTripTimeToMinutes(hoursStr, minutesStr) {
  const h = parseInt(hoursStr, 10);
  const m = parseInt(minutesStr, 10);
  return h * 60 + m;
}

function formatMinutesToHHMM(totalMins) {
  const h = Math.floor(totalMins / 60).toString().padStart(2, '0');
  const m = (totalMins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}
