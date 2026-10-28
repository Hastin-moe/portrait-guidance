// 器材尺寸库（离线 JSON）。供 S2 器材表与场地图使用。
let modLib = null, boardLib = null;

export async function loadGearPresets() {
  if (modLib && boardLib) return { modifiers: modLib, boards: boardLib };
  const [m, b] = await Promise.all([
    fetch("/static/data/modifier-library.json").then(r => r.json()),
    fetch("/static/data/board-presets.json").then(r => r.json()),
  ]);
  modLib = m.items || [];
  boardLib = b.items || [];
  return { modifiers: modLib, boards: boardLib };
}

export function allPresets() {
  return [...(modLib || []), ...(boardLib || [])];
}

export function presetById(id) {
  return allPresets().find(x => x.id === id) || null;
}

export function sizeLabel(g) {
  if (!g) return "";
  if (g.shape === "circle" || (g.diameterCm !== "" && g.diameterCm != null && Number(g.diameterCm) > 0)) {
    return `ø${Number(g.diameterCm)} cm`;
  }
  const w = Number(g.widthCm), h = Number(g.heightCm);
  if (w > 0 && h > 0) return `${w}×${h} cm`;
  if (w > 0) return `${w} cm`;
  return "";
}

/** 把预设写入器材行字段 */
export function applyPreset(gear, preset) {
  if (!preset) return gear;
  gear.presetId = preset.id;
  gear.model = preset.label || [preset.brand, preset.model].filter(Boolean).join(" ") || gear.model;
  gear.shape = preset.shape || "";
  gear.diameterCm = preset.diameter_cm ?? "";
  gear.widthCm = preset.width_cm ?? "";
  gear.heightCm = preset.height_cm ?? "";
  gear.depthCm = preset.depth_cm ?? preset.thickness_cm ?? "";
  if (preset.category === "absorb") gear.type = "absorb";
  else if (preset.category === "modifier" || preset.subcategory) gear.type = gear.type === "light" ? gear.type : "modifier";
  return gear;
}

export function menuItemsFromPresets(presets, { filter = "" } = {}) {
  const q = filter.trim().toLowerCase();
  const list = presets.filter(p => {
    if (!q) return true;
    const hay = [p.brand, p.model, p.label, p.id].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });
  const byBrand = new Map();
  for (const p of list) {
    const brand = p.brand || (p.category === "absorb" ? "Board" : "Other");
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand).push(p);
  }
  const items = [];
  for (const [brand, arr] of byBrand) {
    items.push({ header: brand });
    for (const p of arr) {
      items.push({
        value: p.id,
        label: p.label || p.model || p.id,
        hint: [sizeHint(p), p.confidence].filter(Boolean).join(" · "),
        title: p.source || "",
      });
    }
  }
  return items;
}

function sizeHint(p) {
  if (p.diameter_cm) return `ø${p.diameter_cm} cm`;
  if (p.width_cm && p.height_cm) return `${p.width_cm}×${p.height_cm} cm`;
  return "";
}
