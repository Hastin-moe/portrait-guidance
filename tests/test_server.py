"""本机服务的接口测试：python3 -m unittest tests/test_server.py"""
import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402

PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.srv = server.make_server(Path(cls.tmp.name), 0)
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.tmp.cleanup()

    def req(self, method, path, body=None, headers=None, token=True, raw=False):
        h = dict(headers or {})
        if token:
            h["X-Token"] = server.TOKEN
        data = None
        if body is not None:
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            h.setdefault("Content-Type", "application/json")
        r = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(r) as resp:
                b = resp.read()
                return resp.status, (b if raw else json.loads(b or b"null"))
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"null")

    def test_index_has_token(self):
        st, html = self.req("GET", "/", token=False, raw=True)
        self.assertEqual(st, 200)
        self.assertIn(server.TOKEN.encode(), html)

    def test_api_needs_token(self):
        st, _ = self.req("GET", "/api/projects", token=False)
        self.assertEqual(st, 403)

    def test_project_lifecycle(self):
        st, p = self.req("POST", "/api/projects", {"name": "测试"})
        self.assertEqual(st, 200)
        pid = p["id"]
        p["overview"] = {"theme": "窗光"}
        st, r = self.req("PUT", f"/api/projects/{pid}", p, {"If-Rev": "1"})
        self.assertEqual((st, r["rev"]), (200, 2))
        st, r = self.req("PUT", f"/api/projects/{pid}", p, {"If-Rev": "1"})   # 过期版本
        self.assertEqual(st, 409)
        st, v = self.req("POST", f"/api/projects/{pid}/versions", {"note": "v1"})
        self.assertEqual(st, 200)
        p["name"] = "改名"
        self.req("PUT", f"/api/projects/{pid}", p, {"If-Rev": "2"})
        st, r = self.req("POST", f"/api/projects/{pid}/versions/{v['id']}/restore")
        self.assertEqual(st, 200)
        st, cur = self.req("GET", f"/api/projects/{pid}")
        self.assertEqual(cur["name"], "测试")
        st, lst = self.req("GET", f"/api/projects/{pid}/versions")
        self.assertEqual(len(lst), 2)
        st, dup = self.req("POST", "/api/projects", {"from": pid})
        self.assertTrue(dup["name"].startswith("测试"))
        st, t = self.req("POST", f"/api/projects/{pid}/template", {"name": "模板"})
        st, tl = self.req("GET", "/api/templates")
        self.assertEqual(tl[0]["name"], "模板")
        st, fromt = self.req("POST", "/api/projects", {"template": t["id"], "name": "新"})
        self.assertEqual(fromt["overview"]["theme"], "窗光")
        self.req("POST", f"/api/projects/{pid}/archive", {"archived": True})
        st, lst = self.req("GET", "/api/projects")
        self.assertTrue(any(x["id"] == pid and x["archived"] for x in lst))

    def test_files(self):
        _, p = self.req("POST", "/api/projects", {"name": "img"})
        st, r = self.req("POST", f"/api/projects/{p['id']}/files", PNG, {"Content-Type": "image/png"})
        self.assertEqual(st, 200)
        st, b = self.req("GET", f"/files/{p['id']}/{r['file']}", token=False, raw=True)
        self.assertEqual(b, PNG)
        st, _ = self.req("POST", f"/api/projects/{p['id']}/files", b"x", {"Content-Type": "text/html"})
        self.assertEqual(st, 400)
        st, _ = self.req("GET", f"/files/{p['id']}/..%2Fproject.json", token=False)
        self.assertEqual(st, 404)

    def test_library(self):
        st, _ = self.req("PUT", "/api/library/poses", [{"id": "p1", "name": "回眸"}])
        self.assertEqual(st, 200)
        st, poses = self.req("GET", "/api/library/poses")
        self.assertEqual(poses[0]["name"], "回眸")
        st, r = self.req("POST", "/api/library/files", PNG, {"Content-Type": "image/png"})
        st, b = self.req("GET", f"/lib/{r['file']}", token=False, raw=True)
        self.assertEqual(b, PNG)

    def test_static_traversal(self):
        st, _ = self.req("GET", "/static/../server.py", token=False)
        self.assertEqual(st, 404)

    def test_main_reuses_running_instance(self):
        port = self.srv.server_address[1]
        code = server.main(["--port", str(port), "--no-browser", "--data", self.tmp.name])
        self.assertEqual(code, 0)

    def test_main_exact_port_fails_when_busy(self):
        port = self.srv.server_address[1]
        code = server.main(["--port", str(port), "--no-browser", "--exact-port", "--data", self.tmp.name])
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
