#!/usr/bin/env python3
"""Exercise production Godot HTTP input under a real 15 FPS frame cap.

An external loopback receiver measures time from intent submission to actual
receipt. It neither trusts Godot's ACK timings nor runs in Godot's slow frames.
No game server, credentials, save files, or item operations are used.
"""
import argparse
import http.server
import json
from pathlib import Path
import subprocess
import threading
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--godot", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    received = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            value = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            received.append({
                "sequence": value["sequence"],
                "direction": [value["intent"]["x"], value["intent"]["z"]],
                "delivery_ms": time.time() * 1000 - value["intent"]["probe_sent_ms"],
            })
            body = json.dumps({"sequence": value["sequence"]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            result = subprocess.run([
                args.godot, "--headless", "--max-fps", "15",
                "--path", str(root / "godot-pc"),
                "--script", "res://scripts/network_transport_probe.gd", "--",
                f"--transport-probe-url=http://127.0.0.1:{server.server_port}",
            ], capture_output=True, text=True, timeout=30)
        finally:
            server.shutdown()
            thread.join()
    checks = {
        "real_godot_transport_completed": result.returncode == 0 and "VARENDOR_TRANSPORT_PROBE_DONE" in result.stdout,
        "all_turns_and_neutral_reach_server_in_order": [entry["sequence"] for entry in received] == [1, 2, 3, 4],
        "server_received_original_directions": [entry["direction"] for entry in received] == [[1, 0], [0, -1], [-1, 0], [0, 0]],
        "input_arrives_within_two_15fps_frames": len(received) == 4 and all(0 <= entry["delivery_ms"] < 2000 / 15 for entry in received),
    }
    report = {"ok": all(checks.values()), "frame_cap": 15, "checks": checks, "received": received}
    if not report["ok"]:
        report["runtime_stdout"] = result.stdout
        report["runtime_stderr"] = result.stderr
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
    raise SystemExit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
