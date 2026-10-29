// 机位三维预览对话框（默认 20mm 全画幅视角）
import { h, modal } from "../ui.js";
import { t } from "../i18n.js";
import { buildSceneBoxes, drawCamView, cameraFromElement, DEFAULT_FOCAL, DEFAULT_EYE } from "../camview3d.js";
import * as M from "../model.js";

export function openCamView3d(p, setupId, camEl) {
  let focal = DEFAULT_FOCAL;
  let eye = DEFAULT_EYE;
  let cam = cameraFromElement(camEl, focal, eye);
  let drag = null;

  modal(close => {
    const canvas = h("canvas", {
      width: 960, height: 540,
      style: { width: "100%", maxHeight: "60vh", background: "#111", borderRadius: "8px", cursor: "grab", touchAction: "none" },
    });
    const meta = h("p.small.mut");
    const focalInput = h("input", { type: "number", min: 14, max: 200, step: 1, value: focal, style: { width: "72px", marginLeft: "6px" },
      oninput: e => { focal = Number(e.target.value) || DEFAULT_FOCAL; paint(); } });
    const setFocal = v => { focal = v; focalInput.value = v; paint(); };
    const paint = () => {
      cam.focal = focal;
      cam.hfovDeg = M.fovDeg(focal);
      cam.eye = eye;
      drawCamView(canvas, buildSceneBoxes(p, setupId), cam);
      meta.textContent = t("cam3d.meta", {
        focal,
        fov: Math.round(cam.hfovDeg),
        eye: eye.toFixed(2),
        yaw: Math.round(cam.yaw),
      });
    };

    canvas.addEventListener("pointerdown", e => {
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch };
      canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", e => {
      if (!drag) return;
      cam.yaw = drag.yaw + (e.clientX - drag.x) * 0.25;
      cam.pitch = Math.max(-35, Math.min(25, drag.pitch + (e.clientY - drag.y) * 0.2));
      paint();
    });
    canvas.addEventListener("pointerup", () => { drag = null; canvas.style.cursor = "grab"; });
    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      eye = Math.max(0.8, Math.min(2.4, eye - Math.sign(e.deltaY) * 0.05));
      paint();
    }, { passive: false });

    paint();
    return [
      h("h3", t("cam3d.title")),
      h("p.small.mut", t("cam3d.help")),
      canvas,
      meta,
      h("div.row.wrap", { style: { gap: "10px", marginTop: "10px" } },
        h("label.small", t("cam3d.focal"), focalInput),
        h("button.sm", { onclick: () => setFocal(DEFAULT_FOCAL) }, "20mm"),
        h("button.sm", { onclick: () => setFocal(Number(camEl.focal) || 50) }, t("cam3d.useShotFocal")),
        h("button.sm", { onclick: () => { cam = cameraFromElement(camEl, focal, eye); paint(); } }, t("cam3d.reset"))),
      h("div.acts", h("button.primary", { onclick: () => close() }, t("common.close"))),
    ];
  }, { wide: true });
}
