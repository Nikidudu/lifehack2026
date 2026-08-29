#!/usr/bin/env python3
"""Serve the frontend on a CORS-approved origin.

The backend allows http://localhost:5173 and http://localhost:3000 by default,
so the console must be served over HTTP rather than opened from the filesystem.

    python3 serve.py            # http://localhost:5173
    python3 serve.py --port 3000
"""

import argparse
import http.server
import socketserver
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static handler that never lets a browser cache a demo build."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, format, *args):  # noqa: A002 - signature fixed by base class
        print(f"{self.address_string()} {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5173)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((args.host, args.port), Handler) as httpd:
        print(f"Vendor console: http://localhost:{args.port}")
        print("Stop with Ctrl+C.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
