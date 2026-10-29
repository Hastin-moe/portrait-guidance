// T22：参考图获取（S3 / S4 / S5 共用）
// 五个入口：上传、粘贴、搜索跳转、从情绪板选、AI 生成（设置里填 Key）
import { h, modal, pickFiles, dropZone, toast, promptDlg } from "./ui.js";
import { t } from "./i18n.js";
import { S, uploadImages, fileUrl, api } from "./store.js";
import * as M from "./model.js";

/**
 * 打开「添加参考图」弹窗。
 * @returns {Promise<null|{file:string,source:string,url:string}[]>}
 */
export function openRefPicker(opts = {}) {
  const {
    allowMood = false,
    multiple = true,
    size = "",
    poseName = "",
    poseCues = "",
    toLibrary = false,
  } = opts;
  return modal(close => buildPicker(close, { allowMood, multiple, size, poseName, poseCues, toLibrary }), { wide: true });
}

function buildPicker(close, opts) {
  const state = {
    tab: "upload",
    platform: "xhs",
    query: M.defaultRefSearchQuery(S.project),
    aiPrompt: M.defaultAiPrompt(S.project, opts),
    aiCount: 1,
    busy: false,
    moodSel: new Set(),
  };
  const root = h("div.refpick");

  const onPaste = e => {
    if (state.tab !== "paste" && state.tab !== "search" && state.tab !== "upload") return;
    const items = [...(e.clipboardData?.items || [])].filter(it => it.type.startsWith("image/"));
    if (!items.length) return;
    e.preventDefault();
    const files = items.map(it => it.getAsFile()).filter(Boolean);
    const src = state.tab === "search" ? state.platform : "paste";
    ingestFiles(files, src);
  };
  document.addEventListener("paste", onPaste, true);
  const cleanupPaste = () => document.removeEventListener("paste", onPaste, true);
  const done = v => { cleanupPaste(); close(v); };
  // Esc / 点遮罩走 modal 自带 close，不经过 done：监听弹窗节点移除
  queueMicrotask(() => {
    const back = root.closest(".modal");
    if (!back) return;
    const mo = new MutationObserver(() => {
      if (!document.body.contains(back)) { cleanupPaste(); mo.disconnect(); }
    });
    mo.observe(document.body, { childList: true });
  });

  const redraw = () => root.replaceChildren(...parts());

  const ingestFiles = async (files, source) => {
    if (state.busy) return;
    const list = [...files].filter(f => f && f.type && f.type.startsWith("image/"));
    if (!list.length) return toast(t("ref.noImage"));
    if (!opts.multiple) list.splice(1);
    state.busy = true; redraw();
    try {
      let needUrl = "";
      if (M.REF_SEARCH_PLATFORMS.includes(source)) {
        needUrl = await promptDlg(t("ref.urlTitle"), { placeholder: "https://", help: t("ref.urlHelp") });
        if (needUrl == null) { state.busy = false; redraw(); return; }
      }
      const names = await uploadImages(list, opts.toLibrary);
      done(names.map(file => ({ file, source, url: needUrl || "" })));
    } catch (e) {
      toast(String(e.message || e));
      state.busy = false; redraw();
    }
  };

  const runAi = async () => {
    state.busy = true; redraw();
    try {
      const { data } = await api("POST", `projects/${S.project.id}/ai-images`, {
        prompt: state.aiPrompt.trim(),
        count: state.aiCount,
        toLibrary: !!opts.toLibrary,
      });
      const files = data.files || [];
      if (!files.length) throw new Error(data.error || t("ref.aiFail"));
      done(files.map(file => ({ file, source: "ai", url: "" })));
    } catch (e) {
      toast(String(e.message || e));
      state.busy = false; redraw();
    }
  };

  const parts = () => {
    const tabs = [
      ["upload", t("ref.tab.upload")],
      ["paste", t("ref.tab.paste")],
      ["search", t("ref.tab.search")],
      opts.allowMood ? ["mood", t("ref.tab.mood")] : null,
      ["ai", t("ref.tab.ai")],
    ].filter(Boolean);

    let body;
    if (state.tab === "upload") {
      body = h("div.ref-pane",
        dropZone(h("div.drop.ref-drop", t("ref.drop"), " ",
          h("button.sm", { disabled: state.busy || null, onclick: async () => ingestFiles(await pickFiles({ multiple: opts.multiple }), "upload") }, t("ov.upload"))),
          files => ingestFiles(files, "upload")),
        state.busy ? h("p.small.mut", t("common.loading")) : null);
    } else if (state.tab === "paste") {
      body = h("div.ref-pane", h("p", t("ref.pasteHelp")), h("div.drop.ref-drop", t("ref.pasteHint")), h("p.small.mut", t("ref.pasteKeys")));
    } else if (state.tab === "search") {
      body = h("div.ref-pane",
        h("div.field", h("label", t("ref.query")), h("input", { type: "search", value: state.query, oninput: e => { state.query = e.target.value; } })),
        h("div.field", h("label", t("ref.platform")),
          h("select", { onchange: e => { state.platform = e.target.value; } },
            M.REF_SEARCH_PLATFORMS.map(p => h("option", { value: p, selected: state.platform === p || null }, t("ref.plat." + p))))),
        h("div.row", h("button.primary", {
          disabled: !state.query.trim() || null,
          onclick: () => {
            const url = M.refSearchUrl(state.platform, state.query);
            if (!url) return;
            window.open(url, "_blank", "noopener");
            toast(t("ref.searchOpened"));
          },
        }, t("ref.goSearch"))),
        h("p.small.mut", t("ref.searchThen")),
        dropZone(h("div.drop.ref-drop", t("ref.dropAfterSearch")), files => ingestFiles(files, state.platform)));
    } else if (state.tab === "mood") {
      const mood = S.project?.mood || [];
      body = !mood.length ? h("div.ref-pane", h("p.mut", t("ref.moodEmpty")))
        : h("div.ref-pane",
          h("div.ref-mood", mood.map(m => {
            const on = state.moodSel.has(m.file);
            return h("button.ref-mood-it" + (on ? ".on" : ""), {
              type: "button",
              onclick: () => {
                if (opts.multiple) { on ? state.moodSel.delete(m.file) : state.moodSel.add(m.file); }
                else { state.moodSel.clear(); state.moodSel.add(m.file); }
                redraw();
              },
            }, h("img", { src: fileUrl(m.file), alt: "" }),
              h("span.cap", m.note || m.file.slice(0, 8)),
              m.source === "ai" ? h("span.ai-badge", "AI") : null);
          })),
          h("div.acts", { style: { marginTop: "12px" } },
            h("button.primary", {
              disabled: !state.moodSel.size || null,
              onclick: () => {
                const items = [...state.moodSel].map(file => {
                  const m = mood.find(x => x.file === file);
                  return { file, source: m?.source || "own", url: m?.url || "" };
                });
                done(items);
              },
            }, t("ref.useSelected"))));
    } else {
      const hasKey = !!(S.settings.geminiApiKey || "").trim();
      const cost = M.aiImageCostUsd(state.aiCount);
      body = h("div.ref-pane",
        h("div.field", h("label", t("ref.aiPrompt")),
          h("textarea", { rows: 4, value: state.aiPrompt, oninput: e => { state.aiPrompt = e.target.value; } })),
        h("div.grid2",
          h("div.field", h("label", t("ref.aiCount")),
            h("input", {
              type: "number", min: 1, max: opts.multiple ? 4 : 1, value: state.aiCount,
              oninput: e => { state.aiCount = Math.max(1, Math.min(opts.multiple ? 4 : 1, Number(e.target.value) || 1)); redraw(); },
            })),
          h("div.field", h("label", t("ref.aiCost")), h("div", t("ref.aiCostVal", { n: state.aiCount, usd: cost.toFixed(2) })))),
        !hasKey ? h("p.small", { style: { color: "var(--y)" } }, t("ref.aiNeedKey")) : null,
        h("div.row", h("button.primary", {
          disabled: !hasKey || !state.aiPrompt.trim() || state.busy || null,
          onclick: runAi,
        }, state.busy ? t("common.loading") : t("ref.aiGenerate"))),
        h("p.small.mut", t("ref.aiNote")));
    }

    return [
      h("h3", t("ref.title")),
      h("p.small.mut", t("ref.help")),
      h("div.edit-tabs", tabs.map(([id, label]) =>
        h("button.edit-tab" + (state.tab === id ? ".on" : ""), { type: "button", onclick: () => { state.tab = id; redraw(); } }, label))),
      body,
      h("div.acts", h("button", { onclick: () => done(null) }, t("common.cancel"))),
    ];
  };

  redraw();
  return root;
}
