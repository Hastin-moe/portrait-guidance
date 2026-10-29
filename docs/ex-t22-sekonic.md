# EX · T22 参考图暂放 + L-858D 骨架 + 闪光功率曲线

- 日期：2026-10-30（Asia/Shanghai）
- 分支：`cursor/ex-t22-sekonic-080d`（自 `cursor/t26-fixes-080d`）
- 合并：交给 Claude；本分支不改交接板「完成」状态

## 怎么进

1. 打开任意项目 → 导航 **EX 光比**
2. 顶部分区：
   - **场地图光比** — 原 T14（S6 同数据）
   - **共用参考图** — T22 选图器写入 `project.exTools.refs`
   - **L-858D 测光** — 手填读数 / 导入占位 / 功率曲线查询

S3–S5 原有 T22 弹窗入口未删，仍调 `openRefPicker()`。

## 数据模型

`model.normalize` 补默认：

```text
project.exTools = {
  refs: [{ id, file, source, url, note, shotId, createdAt }],
  sekonic: {
    meter: "Sekonic L-858D",
    readings: [{ id, setupId, elementId, shotId, mode, faceFstop, faceLux, iso, shutter, note, meter, importedAt, createdAt, raw }],
    imports: [{ id, name, note, status, createdAt }]
  }
}
```

读数「写入该灯」会落到元素的 `faceFstop` / `faceLux` / `luxMeter` / `luxNote`（与 S6/EX 灯位测光块一致）。

## 闪光功率曲线接口

| 文件 | 作用 |
|------|------|
| `web/data/flash-power-curves.json` | 曲线库 |
| `web/js/flash-power.js` | `loadFlashCurves` / `getFlashCurve` / `relativeOutput` / `stopsFromFull` / `applyPowerDelta` / `parsePowerLevel` |

`status`：`estimated` | `range_known_curve_ideal` | `pending_measure` | `n_a`  
缺权威实测表时用档位等比（或影室 10 制映射），**不编造 lux 表**。

覆盖概览：Godox AD/QT/MS/SK/DP 系列条目；Broncolor 品牌默认 + 目录灯占位；Profoto 仅占位；Aputure 标 `n_a`（本库为持续光）。

## 已知缺口

- 无 L-858D 导出样例 → 导入按钮只记 `pending_sample`，`raw` 预留
- 功率曲线多为「官方档位范围 + 理想等比」，非实验室曲线
- Profoto 器材目录尚未入库
- EX 参考图未自动进导出 PDF（可后续挂 `exportOpts`）

## Claude 合并注意

- 勿把交接板 T16/T22 擅自标「完成」；本交付是 EX 暂放与接口
- 与 `docs/ex-backlog/sekonic-l858d.md` 互补：骨架已落地，样例仍缺
- 冲突优先保留 `openRefPicker` 单实现，避免复制一份 T22 UI
