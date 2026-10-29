// EX 光比与光效：完整复用 S6 场地图模块（同一份布置数据，改动两边同步），右侧换成光比和光效计算（T14）。
import { renderLayoutPage } from "./layout.js";

export function render(ctx) {
  return renderLayoutPage(ctx, "ex");
}
