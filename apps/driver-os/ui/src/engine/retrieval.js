// engine/retrieval.js — JEDEN deterministyczny silnik retrievalu (fix DUP-1).
// Wcześniej tokenizer + scoring żyły w KnowledgeQA. Teraz są współdzielone:
// KnowledgeQA (wiedza ADR) i każdy przyszły korpus wolnotekstowy używają tego samego.
// Zero AI — czyste dopasowanie po pokryciu tokenów, z progiem siły trafienia.

const STOP = new Set(["czy", "jak", "co", "ile", "gdzie", "kiedy", "moge", "mogę", "jest", "the", "na", "do", "w", "z", "za", "po", "i", "a", "o", "u", "to", "mi", "mnie", "sie", "się"]);

export function tokenize(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    // zachowaj słowa >2 znaki ORAZ krótkie kody (lc, un, 112, dmc) — bez stopwords
    .filter((w) => w.length > 0 && !STOP.has(w) && (w.length > 2 || /[0-9]/.test(w) || /^(lc|un|pp|hp)$/.test(w)));
}

/**
 * retrieveBest — najlepiej pasujący element korpusu do pytania.
 * @param {string} question
 * @param {Array} items      korpus
 * @param {(item)=>string} textOf  jak wydobyć tekst przeszukiwalny z elementu
 * @returns {{item, score, overlap} | null}
 * Próg siły: >=2 trafienia LUB (wysokie pokrycie >=0.6 i >=1 trafienie) — pojedyncze
 * przypadkowe słowo NIE wystarcza (chroni przed fałszywym T1 na słaby match).
 */
export function retrieveBest(question, items, textOf, { minOverlap = 2, minCoverageScore = 0.6 } = {}) {
  const qTokens = tokenize(question);
  if (qTokens.length === 0) return null;
  const qSet = new Set(qTokens);
  let best = null, bestScore = 0, bestOverlap = 0;
  for (const it of items) {
    const ft = tokenize(textOf(it));
    if (ft.length === 0) continue;
    const ftSet = new Set(ft);
    let overlap = 0;
    for (const w of qSet) if (ftSet.has(w)) overlap++;
    const coverage = overlap / qSet.size;
    const score = coverage + overlap * 0.05;
    if (score > bestScore) { bestScore = score; best = it; bestOverlap = overlap; }
  }
  if (!best) return null;
  const strong = bestOverlap >= minOverlap || (bestScore >= minCoverageScore && bestOverlap >= 1);
  return strong ? { item: best, score: bestScore, overlap: bestOverlap } : null;
}
