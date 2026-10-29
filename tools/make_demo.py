#!/usr/bin/env python3
"""生成一个示例项目「春日窗边人像」，方便第一次打开时看看各页面填好后的样子。

用法：python3 tools/make_demo.py [--data 数据目录]
示例图片是程序生成的渐变色块，不是真实照片。
"""
import argparse
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402


def png(w, h, c1, c2):
    rows = []
    for y in range(h):
        k = y / max(1, h - 1)
        r, g, b = (int(c1[i] + (c2[i] - c1[i]) * k) for i in range(3))
        rows.append(b"\x00" + bytes((r, g, b)) * w)
    raw = zlib.compress(b"".join(rows), 9)
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(Path.home() / "Documents" / "portrait-guidance"))
    a = ap.parse_args()
    st = server.Store(Path(a.data).expanduser())
    p = st.create_project({"name": "春日窗边人像"})
    pid = p["id"]
    img = st.projects / pid / "images"
    colors = [((236, 226, 208), (176, 150, 120)), ((210, 222, 230), (120, 140, 160)), ((240, 230, 220), (200, 170, 150)),
              ((220, 215, 200), (90, 85, 80)), ((250, 240, 225), (215, 190, 160)), ((200, 210, 200), (110, 130, 115))]
    files = []
    for i, (c1, c2) in enumerate(colors):
        name = f"demo{i:02d}aaaa.png"
        (img / name).write_bytes(png(160, 120, c1, c2))
        files.append(name)
    looks = [
        {"id": "lk-mia-1", "name": "白衬衫", "status": "ready", "photos": [{"file": files[1], "note": ""}]},
        {"id": "lk-mia-2", "name": "米色针织", "status": "todo", "photos": [{"file": files[2], "note": ""}]},
    ]
    p.update({
        "overview": {"theme": "上午的窗光落在室内，人物安静、松弛，画面低饱和、偏暖。", "keywords": ["窗光", "柔和", "低饱和"], "client": "", "purpose": "作品集",
                     "moodStyle": "低饱和窗光，暗部克制，肤色偏暖；动作松弛、不摆拍。"},
        "mood": [
            {"id": f"m{i}", "file": f, "note": n, "tags": [], "aspects": asp, "source": src, "url": url,
             "x": 5 + 15 * i, "y": 10 + 8 * (i % 3)}
            for i, (f, n, src, url, asp) in enumerate(zip(
                files,
                ["窗光从左后方来，暗部别补", "冷调对比，肤色保留一点暖", "暖色肤色，半身构图", "暗部层次，少补光", "柔和高光，妆发干净", "绿植点缀场景"],
                ["x", "xhs", "web", "own", "ai", ""],
                ["https://x.com/example/status/1", "https://www.xiaohongshu.com/explore/abc",
                 "https://example.com/ref", "", "", ""],
                [["light", "tone"], ["tone", "comp"], ["tone", "makeup"], ["light"], ["light", "makeup"], ["scene", "wardrobe"]],
            ))
        ],
        "time": {"date": "2026-11-08", "start": "10:00", "end": "13:00", "timezone": "Asia/Shanghai",
                 "venueFrom": "09:00", "venueTo": "13:30", "makeupMin": 60, "setupMin": 30, "bufferMin": 10},
        "people": [
            {"id": "mia", "kind": "model", "name": "林夏", "height": 168, "size": "S", "availFrom": "09:00", "availTo": "13:00",
             "roleName": "窗边独白", "rolePitch": "安静、被光吸引的人", "roleTraits": ["安静", "清冷"],
             "paid": True,
             "work": {"arrive": "08:30", "start": "09:00", "end": "13:00", "lunchFrom": "", "lunchTo": "", "overtime": "hourly", "hourlyNote": ""},
             "poseIds": ["pose-lean", "pose-back"],
             "mcn": {"agency": "示例经纪", "agent": "阿陈", "agentContact": "", "contractNo": "MCN-2026-01",
                     "licenseUse": "作品集", "licensePlatform": "小红书 / 官网", "licenseUntil": "2027-12",
                     "fee": "", "settle": "", "note": ""},
             "photos": [{"file": files[0], "note": "封面", "cover": True}],
             "looks": looks},
            {"id": "emma", "kind": "model", "name": "周可", "height": 172, "size": "M", "availFrom": "10:30", "availTo": "",
             "roleName": "来访者", "looks": [{"id": "lk-emma-1", "name": "牛仔外套", "status": "ready"}]},
            {"id": "mk", "kind": "staff", "name": "小唐", "role": "化妆", "contact": ""},
        ],
        "venue": {"name": "白日摄影棚 2 号厅", "address": "", "contact": "", "indoor": True, "w": 8, "d": 6, "h": 3.2, "photos": [files[0]],
                  "windowDir": "北墙两扇落地窗", "daylight": "10:00–13:00 柔和散射", "surfaces": "白墙、浅木地板", "power": "东墙 3 个插座", "zones": "",
                  "gear": [{"id": "vg1", "type": "light", "model": "Godox AD600Pro II（600Ws）", "presetId": "godox-ad600pro-ii", "qty": 2}, {"id": "vg2", "type": "modifier", "model": "120 cm 抛物线柔光箱", "qty": 1},
                           {"id": "vg3", "type": "reflector", "model": "五合一反光板", "qty": 2}]},
        "gear": [{"id": "og1", "type": "camera", "model": "Sony A7C II", "qty": 1, "source": "own"}, {"id": "og2", "type": "lens", "model": "85mm F1.4", "qty": 1, "source": "own"},
                 {"id": "og3", "type": "light", "model": "Godox SL60II D", "presetId": "godox-sl60iid", "qty": 1, "source": "rent"},
                 {"id": "og4", "type": "modifier", "model": "Godox QR-P90T", "qty": 1, "source": "own",
                  "presetId": "godox-qr-p90t", "shape": "circle", "diameterCm": 90, "depthCm": 42.7, "widthCm": "", "heightCm": ""},
                 {"id": "og5", "type": "absorb", "model": "聚苯板 240×120", "qty": 1, "source": "own",
                  "presetId": "polyboard-240x120", "shape": "rect", "widthCm": 240, "heightCm": 120, "depthCm": 5, "diameterCm": ""}],
        "props": [{"id": "pr1", "name": "白纱窗帘", "qty": 1, "size": "2.6 m", "source": "own", "owner": "小唐", "status": "ready"},
                  {"id": "pr2", "name": "藤编椅", "qty": 1, "size": "", "source": "venue", "owner": "", "status": "ready"},
                  {"id": "pr3", "name": "陶瓷杯", "qty": 2, "size": "", "source": "own", "owner": "", "status": "todo"}],
        "layout": {"underlay": None, "activeSetup": "A",
                   "base": [{"id": "w1", "kind": "wall", "x": 4, "y": 0.1, "rot": 0, "w": 8, "h": 0.15},
                            {"id": "wn1", "kind": "window", "x": 2.2, "y": 0.1, "rot": 0, "w": 1.6, "h": 0.15},
                            {"id": "wn2", "kind": "window", "x": 4.6, "y": 0.1, "rot": 0, "w": 1.6, "h": 0.15}],
                   "setups": [
                       {"id": "A", "name": "A", "elements": [
                           {"id": "a-l1", "kind": "light", "x": 1.2, "y": 1.6, "rot": 20, "beam": 70, "modifier": "", "modifierRef": "o:og4", "power": "1/4", "ref": "v:vg1", "faceFstop": 13, "luxMeter": "Sekonic L-858D", "luxNote": "ISO 100，脸位朝灯"},
                           {"id": "a-bd1", "kind": "board", "x": 6.5, "y": 1.2, "rot": 90, "w": 2.4, "h": 0.05, "ref": "o:og5"},
                           {"id": "a-c1", "kind": "camera", "x": 6.2, "y": 3.6, "rot": 205, "focal": 85},
                           {"id": "a-p1", "kind": "person", "x": 3.2, "y": 1.4, "rot": 160, "ref": "mia"},
                           {"id": "a-m1", "kind": "mark", "x": 3.5, "y": 2.0, "rot": 160, "personId": "mia", "ref": "mia",
                            "poseId": "pose-lean", "shotIds": ["s1"], "label": "窗边主站位"},
                           {"id": "a-pr1", "kind": "prop", "x": 3.4, "y": 0.5, "rot": 0, "w": 2.6, "h": 0.2, "ref": "pr1"}]},
                       {"id": "B", "name": "B", "elements": [
                           {"id": "b-bd", "kind": "backdrop", "x": 4, "y": 5.6, "rot": 0, "w": 2.7, "h": 0.1},
                           {"id": "b-l1", "kind": "light", "x": 2.4, "y": 3.2, "rot": 40, "beam": 60, "modifier": "", "power": "1/8", "ref": "v:vg1"},
                           {"id": "b-l2", "kind": "light", "x": 5.8, "y": 3.4, "rot": 140, "beam": 40, "modifier": "蜂巢", "power": "50%", "ref": "o:og3"},
                           {"id": "b-l3", "kind": "light", "x": 5.6, "y": 5.2, "rot": 200, "beam": 60, "modifier": "柔光箱", "power": "1/32", "ref": "v:vg1"},
                           {"id": "b-c1", "kind": "camera", "x": 4, "y": 1.6, "rot": 90, "focal": 50},
                           {"id": "b-p1", "kind": "person", "x": 3.6, "y": 4.4, "rot": 270, "ref": "mia"},
                           {"id": "b-p2", "kind": "person", "x": 4.4, "y": 4.4, "rot": 270, "ref": "emma"},
                           {"id": "b-pr2", "kind": "prop", "x": 4, "y": 4.9, "rot": 0, "w": 1.4, "h": 0.6, "ref": "pr2"}]}]},
        "scenes": [
            {"id": "sc1", "name": "窗边", "setupId": "A", "cameraId": "a-c1", "personIds": ["mia"], "lookIds": ["lk-mia-1"]},
            {"id": "sc2", "name": "沙发", "setupId": "B", "cameraId": "b-c1", "personIds": ["mia", "emma"], "lookIds": ["lk-mia-2", "lk-emma-1"]},
        ],
        "shots": [
            {"id": "s1", "sceneId": "sc1", "order": 0, "size": "half", "focal": 50, "poseId": "pose-lean", "cue": "", "props": ["pr1"], "refs": [files[0]], "minutes": 15, "priority": "must", "notes": "",
             "status": "done", "startedAt": "2026-11-08T10:02:00+08:00", "completedAt": "2026-11-08T10:14:00+08:00"},
            {"id": "s2", "sceneId": "sc1", "order": 1, "size": "close", "focal": 85, "poseId": "pose-back", "cue": "", "props": [], "refs": [files[2], files[4]], "minutes": 10, "priority": "must", "notes": "",
             "status": "done", "startedAt": "2026-11-08T10:16:00+08:00", "completedAt": "2026-11-08T10:25:00+08:00"},
            {"id": "s3", "sceneId": "sc1", "order": 2, "size": "half", "focal": 35, "poseId": "pose-chin", "cue": "", "props": ["pr3"], "refs": [], "minutes": 10, "priority": "opt", "lookIds": ["lk-emma-1"], "notes": "",
             "status": "planned", "startedAt": "", "completedAt": ""},
            {"id": "s4", "sceneId": "sc2", "order": 0, "size": "full", "focal": 35, "poseId": "pose-sit", "cue": "", "props": ["pr2"], "refs": [files[3]], "minutes": 20, "priority": "must", "notes": "",
             "status": "planned", "startedAt": "", "completedAt": ""},
            {"id": "s5", "sceneId": "sc2", "order": 1, "size": "half", "focal": 50, "poseId": "", "cue": "侧光读书，书页挡住下半张脸", "props": [], "refs": [files[5]], "minutes": 15, "priority": "opt", "personIds": ["emma"], "lookIds": ["lk-emma-1"], "notes": "",
             "status": "planned", "startedAt": "", "completedAt": ""},
        ],
    })
    st.write_json(st.projects / pid / "project.json", p)
    poses = st.lib_get("poses") or []
    if len(poses) < 10:
        # T21 起步库：用 node 读 pose_starter.js，保证 demo 镜头 id 对齐
        import subprocess, json as _json
        starter = _json.loads(subprocess.check_output([
            "node", "-e",
            "import('./web/js/pose_starter.js').then(m=>process.stdout.write(JSON.stringify(m.STARTER_POSES)))"
        ], cwd=str(Path(__file__).resolve().parents[1]), text=True))
        by_id = {x["id"]: x for x in poses}
        for x in starter:
            by_id.setdefault(x["id"], x)
        st.lib_put("poses", list(by_id.values()))
    print("示例项目已生成：", p["name"], pid)


if __name__ == "__main__":
    main()
