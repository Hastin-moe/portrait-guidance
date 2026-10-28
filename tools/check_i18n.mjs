// 检查界面文字：代码里用到的每个 key 在 strings.js 里都有，且四种语言都已填写。
// 用法：node tools/check_i18n.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "js");
const STR = (await import(path.join(root, "strings.js"))).default;
const files = [];
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith(".js") && f !== "strings.js" && f !== "i18n.js") files.push(p); } };
walk(root);
const used = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\b[tT]\(\s*"([a-zA-Z0-9_.]+[a-zA-Z0-9_])"\s*[,)]/g)) used.add(m[1]);
}
const DYN = {
  "step.": ["basics", "site", "models", "poses", "shots", "layout", "schedule", "progress", "export", "gear"],
  "status.": ["draft", "pending", "final"], "dot.": ["0", "1", "2"],
  "el.": ["wall", "window", "door", "pillar", "backdrop", "light", "camera", "person", "prop", "text"],
  "size.": ["full", "knee", "half", "bust", "close", "xclose"], "pri.": ["must", "opt"],
  "gear.type.": ["light", "modifier", "stand", "backdrop", "reflector", "camera", "lens", "trigger", "other"],
  "gear.src.": ["own", "rent", "venue"], "prop.": ["todo", "ready"],
  "chk.": ["name", "date", "venue", "venueSize", "shotSetup", "shotModel", "lookMismatch", "noRef", "gearOver", "unbound", "overTime", "lockConflict", "propsNotReady", "setupEmpty"],
  "col.": ["no", "ref", "size", "model", "pose", "min", "pri", "check", "props", "camera", "setup", "notes"],
  "ppl.": ["1", "2", "group"], "ex.sec.": ["cover", "overview", "schedule", "people", "gear", "layout", "shots"],
  "sch.buf.": ["light", "look"], "dur.": ["h", "m", "hm"], "dist.": ["lightPerson", "cameraPerson", "personBackdrop"],
};
for (const [pre, ks] of Object.entries(DYN)) for (const k of ks) used.add(pre + k);
let bad = 0;
for (const k of [...used].sort()) {
  const row = STR[k];
  if (!row) { console.log("缺少 key：", k); bad++; continue; }
  if (row.length !== 4 || row.some(x => typeof x !== "string" || !x.length)) { console.log("语言不全：", k, row); bad++; }
}
const unused = Object.keys(STR).filter(k => !used.has(k));
if (unused.length) console.log("未使用：", unused.join(", "));
console.log(bad ? `✗ ${bad} 个问题` : `✓ ${used.size} 个 key，四种语言齐全`);
process.exit(bad ? 1 : 0);
