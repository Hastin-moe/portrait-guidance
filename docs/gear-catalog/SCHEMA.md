# 器材目录字段说明（portrait-guidance.gear-catalog/v1）

> 详细数据在 `web/data/catalogs/`；S2 尺寸库仍读精简后的 `modifier-library.json` / `light-heads.json` / `board-presets.json`。

## 通用

| 字段 | 含义 |
|---|---|
| `id` | 稳定主键，`品牌-型号` 小写连字符 |
| `brand` / `model` / `label` | 品牌、型号、界面显示名 |
| `category` | `light_head` / `led` / `power_pack` / `lamp_head` / `modifier` / `reflector` |
| `subcategory` | 如 `strobe` / `parabolic_softbox` / `octa_softbox` |
| `shape` | `circle` / `rect`；场地图投影用 |
| `diameter_cm` / `width_cm` / `height_cm` / `depth_cm` | 外形（cm） |
| `weight_kg` | 净重（若有） |
| `mount` | 卡口 |
| `confidence` | `high` / `medium` / `low`（对公开规格完整度的自评） |
| `source` / `source_url` | 主要出处一句 + URL |
| `refs` | 指向 `REFERENCES.md` 中的文献 id |

## 闪光 / 电源

| 字段 | 含义 |
|---|---|
| `power_ws` | 最大闪光能量（Ws / J） |
| `guide_number_m` | `{ value, iso, with }`，GN 米制 |
| `fstop_at_2m` | `{ value, iso, reflector }`，厂商公布光圈（Broncolor 常用） |
| `flash_duration_t01` | t0.1 范围字符串 |
| `recycle_s` | `{ min, max }` 秒 |
| `full_power_flashes` | 满电满功率次数 |
| `cct_flash_k` | 闪光管色温 |
| `hss` | 是否支持高速同步 |
| `modeling` | 造型灯说明 |

## 持续光 / LED

| 字段 | 含义 |
|---|---|
| `power_w` | 最大电功率（W） |
| `cct_k` | `{ min, max }` 或定点 |
| `cri` / `tlci` | 显色指数 |
| `illuminance` | 数组：`{ lux, distance_m, cct_k, modifier, note }` |
| `dimming` | 调光范围 |

## 光效器材

修饰器另可有 `beam_deg`（反光罩光束角）、`max_flash_j`、`max_continuous_w`、`interior`（银/白）。

## 免责

数值来自厂商目录 / 技术表 / 经销商转载，**不是**计量实验室证书；换代型号请核对最新 PDF。照度均为厂商在指定修饰器与色温下的标称值。
