# EX 暂存 · 场地图模块复制 + 光比计算

> 状态：**设计已定，未实现**（Hastin 2026-10-29）  
> 与 `sekonic-l858d.md` 同属 EX；本期 S0–S9 **不实现**完整 EX 页。

## Hastin 定稿意图

1. **完整复制** S6「平面器材布置图」功能模块到 **EX** 区域（不是另画一套无关 UI）。
2. **两个区域布局同步**：S6 与 EX 改灯位 / 修饰器 / 机位 / 吸光板等，彼此同步（同一套 `layout` 几何，或明确的双向同步契约）。
3. **内部计算分叉**：
   - S6：策划布置、尺寸投影、距离、（已预留）实测照度录入。
   - EX：在同一布局上算 **光比、光效差异**（主辅光比、修饰器后相对输出等）；不重复造布置编辑器。
4. 实测照度录入位必须与平面布置图灯位 **一一对应**（已落在 layout light 元素的 `exitLux` / `faceLux`，供 EX 读取）。

## 建议数据契约（供 Claude 审）

| 层 | 建议 |
|---|---|
| 几何源 | 单一真相：`project.layout`（setups / elements） |
| S6 UI | 现有 `pages/layout.js` + `canvas.js` |
| EX UI | 复用同一 canvas / 选择模型；旁路面板换成光比 / 光效计算 |
| 实测 | `elements[kind=light].exitLux` / `faceLux` / `luxMeter` / `luxNote` |
| 厂商标称 | `web/data/catalogs/*`（只读参考，不覆盖实测） |

## 不做（本期）

- 不新建独立 layout schema 分叉。
- 不接付费 API / CDN / 非标准库。
- 不实现完整光比公式（留给 EX 卡；需 Claude 与 Hastin 定算法假设）。

## 与已落地字段的关系

S6 右侧「实测照度」已可录入。EX 实现时应 **读这些字段**，不要在 gear 清单再开一套互不同步的 lux 输入。
