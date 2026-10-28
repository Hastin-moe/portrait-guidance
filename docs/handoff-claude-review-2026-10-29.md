# Claude 复核交接 · 2026-10-29（Asia/Shanghai）

> 写给：**Claude（审核）**　·　执行：Grok / Cloud Agent　·　所有者：Hastin  
> 工作目录：`~/Desktop/Claude-portrait-guidance/`  
> 分支：`cursor/gear-lib-camview3d-2224`（**无 origin remote，未推送**）  
> 请只把看板改到你确认后的状态；执行侧最多 `待复核`。

---

## 1. 请你复核的卡

| 卡 | 状态 | 内容摘要 |
|---|---|---|
| **T12** | 待复核 | 器材库扩写 + 详细 catalogs（Godox/Bron/Aputure）+ 实测照度字段预留 |
| **T13** | 待复核 | S6 机位 20mm 第一人称三维预览 |
| T11 | 待办 | 0.2.0 遗留；其中 **A3** 已在 T12 顺手修掉 |
| T10 | 待办 | 四语文档（仍归 Claude） |
| **EX** | 设计暂存 | 场地图模块复制进 EX + 光比计算；见 §5 |

---

## 2. 关键提交（本分支，新→旧）

| SHA | 说明 |
|---|---|
| `d6afbf6` | S6 灯具预留 `exitLux` / `faceLux` / 测光表备注；导出表加列 |
| `3c978e8` | 补全 Aputure STORM 80c、amaran Ray 360c 等（灯具 6→21） |
| `734e4f1` | Aputure 初版 + Godox MS/SK/QT/DP/Knowled |
| `04f8bb2` | Godox/Bron 发光运行参数 catalogs + REFERENCES |
| `96aacd4` | T12 尺寸库扩写 + T13 camview3d + A3 |

测试（执行侧最后一次）：`model` 22 PASS · `server` 9 PASS · `i18n` 606 key · e2e 本批数据卡未重跑（`d6afbf6` 后建议 Claude 复核时再跑四项）。

---

## 3. T12 交付物

### 3.1 详细目录（光电参数）

路径：`web/data/catalogs/`

| 文件 | 条数 |
|---|---:|
| `godox-lights.json` | 29 |
| `godox-modifiers.json` | 16 |
| `broncolor-lights.json` | 9 |
| `broncolor-modifiers.json` | 17 |
| `aputure-lights.json` | 21 |
| `aputure-modifiers.json` | 6 |
| **合计** | **98** |

文档：

- `docs/gear-catalog/SCHEMA.md` — 字段说明 + **实测字段契约**
- `docs/gear-catalog/REFERENCES.md` — 出处 / 照度方法
- `docs/gear-catalog/README.md` — 入口

S2 精简库（几何）：`web/data/light-heads.json`、`modifier-library.json`（场地图仍读这两份；完整 lux/GN 在 catalogs）。

### 3.2 刻意未做

- **Profoto**：Hastin 要求最后补 → **仍未收录**。
- 神牛 VL / 部分 SL Bi lux 表、Ray 60c/120c lux 细表仍有缺口。
- catalogs **尚未**被 `gear-presets.js` 运行时加载（S2 仍走精简 JSON）；完整参数目前是数据资产，供后续 EX / 尺寸库合并。

### 3.3 实测照度（已落地，供 EX 复用）

- 位置：**S6 → 选中灯 → 右侧「实测照度」**
- 字段：`exitLux`、`faceLux`、`luxMeter`、`luxNote`（`normalize` + `newElement` 默认 `""`）
- 导出布置表已含出口 / 脸部两列
- **Hastin 补充（本次）**：EX 要 **完整复制** 平面布置模块，与 S6 **同步改布局**；EX 侧侧重光比 / 光效计算。设计稿：`docs/ex-backlog/layout-sync-ratio.md`

---

## 4. T13 交付物（此前已标待复核）

- `web/js/camview3d.js`、`pages/camview.js`
- S6 选中机位 →「3D 预览（20mm）」；原生 Canvas，无 CDN
- 测试覆盖 20mm FOV、场景盒体

---

## 5. EX 设计要点（请 Claude 审架构，勿当本期已实现）

Hastin 原话要点：

> 实测照度要和平面器材布置图对应；希望把平面布置图模块完整复制到 EX；两区域同步改布局；EX 内主要算光比与光效差异，只复制该功能模块。

执行侧理解（请纠正）：

1. **一个 layout 数据源**，两套视图（S6 策划 / EX 光比）。
2. 不要为 EX 再维护一套互不同步的灯位坐标。
3. 光比算法、与 catalogs 标称 lux 的换算规则 → **待你与 Hastin 定**；现仅有实测字段槽位 + 厂商标称表。
4. Sekonic 导入仍见 `docs/ex-backlog/sekonic-l858d.md`（未实现）。

---

## 6. 建议 Claude 审核清单

1. [ ] catalogs 字段是否够 EX / 光比用，缺什么（例如统一 `illuminance[]` vs Bron f-stop）。
2. [ ] S2 精简库 vs catalogs 双轨是否接受；是否应合并加载。
3. [ ] `exitLux`/`faceLux` 挂在 layout light 是否正确（vs shot / gear）。
4. [ ] EX「复制模块 + 同步布局」架构是否认可 `docs/ex-backlog/layout-sync-ratio.md`。
5. [ ] T13 三维是否只作构图参考、验收标准是否够。
6. [ ] T11 剩余 A/B 项是否仍按原板挂起。
7. [ ] Profoto 排期是否维持「最后」。
8. [ ] 无 remote：是否需要 Hastin 建 GitHub remote 再推。

---

## 7. 相关路径速查

```
交接板.md / 交接日志.md
docs/handoff-claude-review-2026-10-29.md   ← 本文件
docs/gear-catalog/*
docs/ex-backlog/sekonic-l858d.md
docs/ex-backlog/layout-sync-ratio.md
web/data/catalogs/*
web/data/light-heads.json
web/data/modifier-library.json
web/js/camview3d.js
web/js/pages/camview.js
web/js/pages/layout.js          ← 实测照度 UI
web/js/model.js                 ← newElement / normalize lux
```
