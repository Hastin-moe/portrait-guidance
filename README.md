# 人像策划指导 · portrait-guidance

人像拍摄的策划工具：把一次拍摄的信息、场地布置、分镜与动作、拍摄日时间表整理成一份可以导出的策划案。

和 Photo-cull 一样是本机程序：一个只监听 `127.0.0.1` 的小服务器加浏览器里的界面。只用 Python 标准库，**不需要安装任何依赖**，也不需要联网或账号。

## 启动

- macOS：双击 `启动人像策划指导.command`
- Windows：双击 `启动人像策划指导.bat`
- 命令行：`python3 server.py`（可选 `--data 数据目录`、`--port 端口`、`--no-browser`）

第一次想看看填好的样子，可以先生成一个示例项目：`python3 tools/make_demo.py`

## 数据放在哪

默认在 `~/Documents/portrait-guidance/`：

| 位置 | 内容 |
|---|---|
| `projects/<id>/project.json` | 项目数据。每个项目一个文件夹，可整体拷走或备份（F38） |
| `projects/<id>/images/` | 情绪板、参考图、底图、场地照片 |
| `projects/<id>/versions/` | 手动存的版本（⌘S），定稿时自动存一份 |
| `library/poses.json`、`library/files/` | 动作库，跨项目共用 |
| `library/venues.json` | 场地库，跨项目共用 |
| `library/templates/` | 模板 |

## 页面与规格对照

| 页面 | 功能 | 主要内容 |
|---|---|---|
| S0 项目列表 | F01–F03 | 新建、从模板新建、复制、归档、搜索、按状态筛选、完整度、导入 JSON（含 Grok 旧版转换） |
| S1 基础信息 `basics` | F05、F08–F09 | 概况、时区、拍摄/到场时间、工作人员、地点 |
| S2 场地与器材 `site` | F10–F14 | 场地条件与尺寸、器材（尺寸库 / 吸光板）、道具、打包清单 |
| S3 模特与样图 `models` | F06–F07、F09 | 模特与造型、情绪板与来源链接 |
| S4 动作库 `poses` | F26 | 示意图、要点（重心 / 手位 / 视线）、适用景别与人数、标签 |
| S5 分镜表 `shots` | F23–F27 | 按场景分组与继承、时长预算、检查列、详情抽屉、⌘K 动作库、批量操作 |
| S6 场地图 `layout` | F15–F20 | 等比网格、图元、清单绑定、底图标定、多套布光方案、距离、导出 PNG |
| S7 时间轴 `schedule` | F29–F30 | 自动排程、换装换灯缓冲、拖动锁定、超时提示 |
| S8 进度看板 `progress` | 新增 | 开始 / 完成 / 跳过 / 重拍、改时间、导出分镜时间窗 `.plan.json` |
| S9 预览导出 `export` | F31–F32 | 章节勾选、四语导出、打印 / PDF、数据备份、存为模板 |
| 通用 | F35–F38 | 中英日韩界面、撤销 / 重做（80 步）、完整度检查、本地文件存储 |

暂缓或只留入口：AI 起草（F07）、文字转布置（F21）、AI 意向图（F22）、AI 分镜建议（F28）、现场版（F33）、分享给客户（F34）。

## 代码结构

```
server.py              本机服务与文件存储（标准库）
web/index.html
web/css/tokens.css     设计变量（沿用 Photo-cull）
web/css/app.css
web/js/model.js        领域逻辑：继承、镜号、器材用量、排程、检查、完整度（纯函数，有测试）
web/js/store.js        当前项目、自动保存、撤销 / 重做、资料库
web/js/canvas.js       布置图绘制（编辑器、缩略图、导出共用）
web/js/strings.js      四语界面文字
web/js/pages/*.js      各页面
tools/                 示例数据、界面文字检查
tests/                 测试
```

## 测试

```
node --test tests/model.test.mjs        # 领域逻辑
python3 -m unittest tests/test_server.py # 接口
node tools/check_i18n.mjs               # 四种语言是否齐全
python3 tests/e2e_smoke.py              # 浏览器流程（需要 Playwright）
```
