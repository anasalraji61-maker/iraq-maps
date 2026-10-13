"""Start a Valhalla routing service on an available port.

CLI contract (RoutingCliContracts.routingServe):
  python serve.py --config <valhalla.json> --port <port>

Starts valhalla_service until killed. GET /status answers 200 once ready.
When --port is 0, picks a random available port and prints it to stdout.
"""

from __future__ import annotations

import argparse
import json
import socket
import subprocess
import sys
import time
from pathlib import Path


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def patch_config_port(config_path: Path, port: int) -> Path:
    """Write a copy of the config with the given port; returns the copy path."""
    config = json.loads(config_path.read_text())
    config["httpd"]["service"]["listen"] = f"tcp://127.0.0.1:{port}"
    patched = config_path.parent / f"valhalla_{port}.json"
    patched.write_text(json.dumps(config, indent=2))
    return patched


def wait_ready(port: int, timeout: float = 30.0) -> bool:
    import urllib.request
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/status", timeout=2):
                return True
        except Exception:
            time.sleep(0.5)
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve Valhalla routing")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()

    port = args.port if args.port else find_free_port()
    config = patch_config_port(args.config, port)

    proc = subprocess.Popen(
        ["valhalla_service", str(config), "1"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    if not wait_ready(port):
        proc.terminate()
        print(f"Valhalla service did not start within 30s on port {port}", file=sys.stderr)
        sys.exit(1)

    print(port, flush=True)
    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()


if __name__ == "__main__":
    main()
