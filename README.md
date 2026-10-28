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
| S0 项目列表 | F01–F03 | 新建、从模板新建、复制、归档、搜索、按状态筛选、完整度 |
| S1 概要与情绪板 | F05–F07 | 基本信息、风格关键词、情绪板（网格 / 自由排列、标注、设为参考图） |
| S2 时间与人员 | F08–F09 | 拍摄时间与提前量、自动到场时间、模特（造型套数）与工作人员 |
| S3 场地 | F10–F11 | 场地库、场地条件、场地器材 |
| S4 器材与道具 | F12–F14 | 合并器材清单（已用 / 总数、超用警告）、道具、打包清单 |
| S5 布置图 | F15–F20 | 等比网格画布、图元、从清单拖入即绑定、底图与两点标定、多套布光方案与并排对比、距离、导出 PNG |
| S6 分镜 | F23–F27 | 按场景分组与继承、时长预算、检查列、详情抽屉（参考图、机位与布光缩略图）、⌘K 动作库、批量操作、卡片视图 |
| S7 动作库 | F26 | 示意图、要点（重心 / 手位 / 视线）、适用景别与人数、标签 |
| S8 时间表 | F29–F30 | 自动排程、换装换灯缓冲、拖动锁定时间、超时与可删镜头 |
| S9 预览与导出 | F31–F32 | 章节勾选、四种语言导出、打印 / 存为 PDF、数据备份、存为模板 |
| 通用 | F35–F38 | 中英日韩界面、撤销 / 重做（80 步）、完整度检查、本地存储 |

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
