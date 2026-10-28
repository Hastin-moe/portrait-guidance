// 四语界面：所有界面文字都在 strings.js，每条按 [中文, English, 日本語, 한국어] 排列。
// 用户自己输入的内容（项目名、备注等）不翻译。
import STR from "./strings.js";

export const LANGS = [["zh", "中文"], ["en", "English"], ["ja", "日本語"], ["ko", "한국어"]];
const IDX = { zh: 0, en: 1, ja: 2, ko: 3 };
const HTML_LANG = { zh: "zh-CN", en: "en", ja: "ja", ko: "ko" };
let cur = "zh";

export function setLang(l) {
  cur = IDX[l] != null ? l : "zh";
  document.documentElement.lang = HTML_LANG[cur];
}
export const getLang = () => cur;

// t("key", {n: 3}) ；第三个参数可指定语言（导出时用）
export function t(key, params, lang = cur) {
  const row = STR[key];
  let s = row ? (row[IDX[lang]] ?? row[0]) : key;
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ""));
  return s;
}

export function fmtDate(iso, lang = cur) {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(HTML_LANG[lang], { year: "numeric", month: "short", day: "numeric", weekday: "short" });
}

export function fmtDuration(min, lang = cur) {
  min = Math.max(0, Math.round(min || 0));
  const hh = Math.floor(min / 60), mm = min % 60;
  if (!hh) return t("dur.m", { m: mm }, lang);
  if (!mm) return t("dur.h", { h: hh }, lang);
  return t("dur.hm", { h: hh, m: mm }, lang);
}
