// S8 进度看板占位：T5 实现完整看板。
import { t } from "../i18n.js";
import { h } from "../ui.js";
import { emptyState } from "./common.js";

export function render() {
  return {
    main: h("div",
      h("h2.pt", t("step.progress")),
      h("p.sub", t("progress.sub")),
      emptyState(t("progress.stubTitle"), t("progress.stubBody"))),
    panel: h("div", h("h4", t("panel.tips")), h("p.small.mut", t("progress.stubBody"))),
  };
}
