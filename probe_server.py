#!/usr/bin/env python3
"""
自分用の計測対象サーバー（SUT）を立てるための小さなヘルパー。

なぜ必要か:
    ブラウザから他オリジンを計測するには、対象側が CORS ヘッダを返す必要がある。
    python3 -m http.server にはそれが無いため、このスクリプトで補う。
    受信件数を返すので、ページ側の計測値と突き合わせて検証できる。

使い方:
    python3 probe_server.py --port 8000
    # 表示された URL をページの「対象 URL」に入れる。

    --root  配信するディレクトリ（既定: このスクリプトと同じ場所）
    --host  待ち受けアドレス（既定: 127.0.0.1。外部公開は明示的に指定した時だけ）

エンドポイント:
    /                      index.html など、root 内のファイル
    /__ping__              固定 204。計測用の軽量エンドポイント
    /__slow__?ms=200       指定ミリ秒待ってから 200 を返す
    /__stats__             受けたリクエストの集計（JSON）
    /__reset__             ↑の集計をゼロに戻す

注意:
    既定で 127.0.0.1 のみ待ち受ける。LAN に出す場合は --host 0.0.0.0 を明示する。
    CORS を全許可しているので、インターネットに晒さないこと。
"""

import argparse
import json
import os
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

STATS_LOCK = threading.Lock()
STATS = {"total": 0, "first": None, "last": None, "per_second": {}}


def record_hit(path: str) -> None:
    now = time.time()
    bucket = int(now)
    with STATS_LOCK:
        STATS["total"] += 1
        if STATS["first"] is None:
            STATS["first"] = now
        STATS["last"] = now
        STATS["per_second"][bucket] = STATS["per_second"].get(bucket, 0) + 1
        if len(STATS["per_second"]) > 600:
            cutoff = bucket - 600
            for k in [k for k in STATS["per_second"] if k < cutoff]:
                del STATS["per_second"][k]


def stats_snapshot() -> dict:
    with STATS_LOCK:
        counts = dict(STATS["per_second"])
        return {
            "total": STATS["total"],
            "first_request": STATS["first"],
            "last_request": STATS["last"],
            "peak_requests_per_second": max(counts.values()) if counts else 0,
            "seconds_seen": len(counts),
        }


class Handler(SimpleHTTPRequestHandler):
    # CORS を全許可。テスト用サーバーであり、認証情報は受け取らない前提。
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # 集計用エンドポイント自身は数えない（数字がずれて混乱するため）
        if path == "/__stats__":
            body = json.dumps(stats_snapshot(), ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        record_hit(path)

        if path == "/__reset__":
            with STATS_LOCK:
                STATS.update({"total": 0, "first": None, "last": None, "per_second": {}})
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if path == "/__ping__":
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if path == "/__slow__":
            qs = parse_qs(parsed.query)
            try:
                ms = int(qs.get("ms", ["200"])[0])
            except ValueError:
                ms = 200
            time.sleep(max(0, min(ms, 10000)) / 1000.0)
            body = b"slow ok\n"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        super().do_GET()

    def log_message(self, fmt, *args):
        # 標準のログは 1 行 1 行が冗長なので簡略化する
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


def main() -> None:
    parser = argparse.ArgumentParser(description="Self-hosted measurement target")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--root", default=os.path.dirname(os.path.abspath(__file__)))
    args = parser.parse_args()

    os.chdir(args.root)
    srv = ThreadingHTTPServer((args.host, args.port), Handler)

    print("measurement target: http://%s:%d/" % (args.host, args.port))
    print("serving root      : %s" % args.root)
    print("stats             : /__stats__   (reset: /__reset__)")
    print("Ctrl-C で停止")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
        srv.server_close()


if __name__ == "__main__":
    main()
