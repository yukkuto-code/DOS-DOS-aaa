#!/usr/bin/env python3
"""GitHub Pages と同じ「404 の返し方」をローカルで再現する静的サーバー。

GitHub Pages は、実ファイルが無いパスへのアクセスに対して
**ステータス 404 のまま 404.html を返す**（リダイレクトはしない）。
その挙動をそのまま手元で確認するための小さなサーバー。

  python3 serve.py                 # -> http://127.0.0.1:8123/
  python3 serve.py --port 9000
  python3 serve.py --dir .         # 配信するディレクトリ（既定はこのファイルの場所）

挙動:
  * 実ファイルがあるパス        -> 200 で返す（html 以外の css/js/ping.txt も含む）
  * ディレクトリ + index.html   -> 200 で index.html を返す
  * それ以外（存在しないパス、拡張子なしの /foo、/index など）
                                -> **404** + 404.html の中身
  * ディレクトリ一覧は出さない（404 扱い）

標準ライブラリのみ。外部依存なし。
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import posixpath
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

FALLBACK_404 = (
    "<!doctype html><meta charset=\"utf-8\">"
    "<title>404 Not Found</title>"
    "<h1>404 Not Found</h1><p>404.html が見つかりません。</p>"
)


class Handler(BaseHTTPRequestHandler):
    server_version = "pages-404-sim/1.0"
    protocol_version = "HTTP/1.1"

    # -- ルーティング ---------------------------------------------------------
    def _safe_path(self) -> str | None:
        """URL を配信ディレクトリ配下の絶対パスに変換する。脱出は None。"""
        raw = unquote(urlsplit(self.path).path)
        parts = [p for p in posixpath.normpath(raw).split("/") if p not in ("", ".", "..")]
        target = os.path.join(self.server.root, *parts)
        root = os.path.abspath(self.server.root)
        target = os.path.abspath(target)
        if target != root and not target.startswith(root + os.sep):
            return None
        return target

    def _resolve(self) -> str | None:
        """実ファイルに解決できればそのパス、できなければ None。"""
        target = self._safe_path()
        if target is None:
            return None
        if os.path.isdir(target):
            index = os.path.join(target, "index.html")
            return index if os.path.isfile(index) else None
        return target if os.path.isfile(target) else None

    # -- 応答 -----------------------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802
        self._serve(body=True)

    def do_HEAD(self) -> None:  # noqa: N802
        self._serve(body=False)

    def _serve(self, body: bool) -> None:
        target = self._resolve()
        if target is None:
            self._send_not_found(body)
        else:
            self._send_file(target, body)

    def _send_file(self, path: str, body: bool) -> None:
        try:
            with open(path, "rb") as f:
                data = f.read()
        except OSError:
            self._send_not_found(body)
            return

        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        # 更新したらすぐ反映されるように（Pages も同様に短いキャッシュ）
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if body:
            self.wfile.write(data)

    def _send_not_found(self, body: bool) -> None:
        """404 ステータスのまま 404.html を返す（Pages と同じ）。"""
        doc = os.path.join(self.server.root, "404.html")
        try:
            with open(doc, "rb") as f:
                data = f.read()
        except OSError:
            data = FALLBACK_404.encode("utf-8")

        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex")
        self.end_headers()
        if body:
            self.wfile.write(data)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[serve] %s %s\n" % (self.address_string(), fmt % args))


def main() -> int:
    ap = argparse.ArgumentParser(description="GitHub Pages 互換（404.html）の静的サーバー")
    ap.add_argument("--port", type=int, default=8123)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--dir", default=os.path.dirname(os.path.abspath(__file__)))
    args = ap.parse_args()

    root = os.path.abspath(args.dir)
    if not os.path.isfile(os.path.join(root, "index.html")):
        print(f"警告: {root} に index.html がありません", file=sys.stderr)

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.root = root  # type: ignore[attr-defined]
    print(f"serving {root}")
    print(f"  -> http://{args.host}:{args.port}/index.html")
    print(f"  -> http://{args.host}:{args.port}/nope       (404 + 404.html -> index.html)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
