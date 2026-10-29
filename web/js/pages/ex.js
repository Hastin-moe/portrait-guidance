// EX 光比与光效：默认复用 S6 场地图（T14）；另暂放 T22 参考图与 L-858D 测光骨架。
import { h } from "../ui.js";
import { renderLayoutPage } from "./layout.js";
import { exSectionNav, renderExRefs, renderExSekonic } from "./ex-tools.js";

export function render(ctx) {
  const st = ctx.state;
  st.exSection = st.exSection || "ratios";
  if (st.exSection === "refs") return renderExRefs(ctx);
  if (st.exSection === "sekonic") return renderExSekonic(ctx);

  const page = renderLayoutPage(ctx, "ex");
  const nav = exSectionNav(ctx);
  // 把分区导航插到 EX 标题行下方（main 第一个子树前）
  const main = h("div.ex-wrap", nav, page.main);
  return { main, panel: page.panel };
}
