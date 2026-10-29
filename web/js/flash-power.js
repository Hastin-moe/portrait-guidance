// 闪光功率曲线：档位 ↔ 相对输出（供 EX 光比 / 照度估算后续接入）
// 数据：/static/data/flash-power-curves.json

let cache = null;
let loading = null;

export function flashCurvesCache() { return cache; }

export async function loadFlashCurves() {
  if (cache) return cache;
  if (loading) return loading;
  loading = fetch("/static/data/flash-power-curves.json")
    .then(r => { if (!r.ok) throw new Error("flash-power-curves " + r.status); return r.json(); })
    .then(doc => { cache = doc; return doc; })
    .catch(e => { cache = { schema: "", curves: [], error: String(e) }; return cache; });
  return loading;
}

export function listFlashCurves(doc = cache) {
  return (doc && doc.curves) || [];
}

/** 按器材目录 id 或曲线 id 查找；找不到则退回理想等比曲线 */
export function getFlashCurve(key, doc = cache) {
  const curves = listFlashCurves(doc);
  if (!key) return curves.find(c => c.id === "ideal-proportional") || null;
  const byId = curves.find(c => c.id === key);
  if (byId) return resolveCurve(byId, curves);
  const byCat = curves.find(c => (c.catalogIds || []).includes(key));
  if (byCat) return resolveCurve(byCat, curves);
  const brand = String(key).split("-")[0];
  const byBrand = curves.find(c => c.brandDefault && c.brand && c.brand.toLowerCase() === brand.toLowerCase());
  if (byBrand) return resolveCurve(byBrand, curves);
  return resolveCurve(curves.find(c => c.id === "ideal-proportional"), curves);
}

function resolveCurve(c, curves) {
  if (!c) return null;
  if (!c.inherits) return c;
  const base = curves.find(x => x.id === c.inherits);
  if (!base) return c;
  return {
    ...base,
    ...c,
    points: c.points && c.points.length ? c.points : base.points,
    scale: c.scale || base.scale,
    step: c.step != null ? c.step : base.step,
  };
}

/** 档位文案 → 相对满功率的档数（满功率 = 0） */
export function stopsFromFull(curve, level) {
  if (!curve || level == null || level === "") return null;
  const s = String(level).trim();
  const hit = (curve.points || []).find(p => String(p.level) === s);
  if (hit && hit.stopsFromFull != null) return Number(hit.stopsFromFull);
  if (curve.scale === "fraction" || !curve.scale) {
    const m = s.match(/^1\/(\d+(?:\.\d+)?)$/);
    if (m) {
      const den = Number(m[1]);
      if (den > 0) return Math.log2(den);
    }
    if (s === "1" || s === "1/1" || s === "full") return 0;
  }
  if (curve.scale === "broncolor_10" || curve.scale === "display_10" || curve.scale === "godox_studio_10") {
    const n = Number(s);
    if (Number.isFinite(n)) return (curve.fullDisplay != null ? Number(curve.fullDisplay) : 10) - n;
  }
  return null;
}

/** 相对输出（满功率 = 1）。缺测曲线时按 2^(-stops) 估算并标记 estimated */
export function relativeOutput(curve, level) {
  if (!curve) return null;
  const hit = (curve.points || []).find(p => String(p.level) === String(level).trim());
  if (hit && hit.relativeOutput != null) {
    return { value: Number(hit.relativeOutput), estimated: hit.estimated === true || curve.status === "estimated" || curve.status === "range_known_curve_ideal" };
  }
  const stops = stopsFromFull(curve, level);
  if (stops == null) return null;
  return { value: Math.pow(2, -stops), estimated: true };
}

/** 两档之间的 EV 差（正 = levelB 比 levelA 更亮） */
export function stopsBetween(curve, levelA, levelB) {
  const a = stopsFromFull(curve, levelA);
  const b = stopsFromFull(curve, levelB);
  if (a == null || b == null) return null;
  return a - b;
}

/** 从某档加减 N 档，返回最近的已知档位（无精确点则返回理论 fraction） */
export function applyPowerDelta(curve, fromLevel, deltaStops) {
  const from = stopsFromFull(curve, fromLevel);
  if (from == null) return null;
  const target = from - Number(deltaStops);
  const pts = (curve.points || []).slice().sort((x, y) => x.stopsFromFull - y.stopsFromFull);
  if (pts.length) {
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.stopsFromFull - target) < Math.abs(best.stopsFromFull - target)) best = p;
    return { level: best.level, stopsFromFull: best.stopsFromFull, relativeOutput: best.relativeOutput, estimated: true };
  }
  const den = Math.pow(2, target);
  const level = den <= 1 ? "1/1" : `1/${Math.round(den)}`;
  return { level, stopsFromFull: target, relativeOutput: Math.pow(2, -target), estimated: true };
}

/** 解析灯位 power 字段里常见写法：1/8、1/8.0、8.0（10 制）、AD 的 M 档等 */
export function parsePowerLevel(raw, curve) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (/^1\/\d/.test(s)) return s.split(/\s/)[0];
  const n = Number(s.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return s;
  if (curve && (curve.scale === "broncolor_10" || curve.scale === "display_10")) return String(n);
  // Godox 影室 5.0–10.0：10=1/1，每减 1 ≈ 一档
  if (n >= 1 && n <= 10 && curve && curve.scale === "godox_studio_10") return String(n);
  return s;
}
