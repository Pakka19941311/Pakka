"""Encode actual Godot captures at their recorded wall-clock times, without interpolation."""
import argparse
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Directory containing knight-integration.json and JPG captures")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    args = parser.parse_args()
    directory = args.directory.resolve()
    report_path = directory / "knight-integration.json"
    if not report_path.is_file():
        report_path = directory / "knight-native.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    native = report.get("native", report)
    if not native.get("checks", {}).get("native_render"):
        raise RuntimeError("Video requires actual rendered Godot frames")
    frames = native.get("measurements", {}).get("recorded_frames", [])
    if len(frames) < 2:
        raise RuntimeError("At least two recorded frames are required")
    paths = []
    times = []
    for frame in frames:
        name = str(frame["file"])
        if Path(name).name != name or not name.startswith("knight-frame-"):
            raise RuntimeError("Unexpected captured frame filename")
        path = directory / name
        if not path.is_file():
            raise FileNotFoundError(path)
        paths.append(path)
        times.append(int(frame["wall_ms"]))
    if any(right <= left for left, right in zip(times, times[1:])):
        raise RuntimeError("Recorded frame timestamps must strictly increase")

    concat_path = directory / "knight-gameplay.ffconcat"
    lines = ["ffconcat version 1.0"]
    for index, path in enumerate(paths):
        # A millisecond input time base retains the native wall_ms precision.
        quoted = path.as_posix().replace("'", "'\\''")
        lines.extend(["file '" + quoted + "'", "option framerate 1000"])
        interval_ms = times[index + 1] - times[index] if index + 1 < len(times) else 1
        lines.append(f"duration {interval_ms / 1000:.3f}")
    concat_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    video = directory / "Varendor_Knight_Gameplay.mp4"
    subprocess.run([
        args.ffmpeg, "-hide_banner", "-loglevel", "warning", "-y",
        "-f", "concat", "-safe", "0", "-i", str(concat_path),
        "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-fps_mode", "vfr", "-enc_time_base", "1:1000",
        "-video_track_timescale", "1000", "-movflags", "+faststart", str(video),
    ], check=True)
    probe = json.loads(subprocess.check_output([
        args.ffprobe, "-v", "error", "-select_streams", "v:0", "-show_frames",
        "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", str(video),
    ], text=True))
    encoded_times = [float(frame["best_effort_timestamp_time"]) for frame in probe["frames"]]
    if len(encoded_times) != len(frames):
        raise RuntimeError("Encoder added or dropped capture frames")
    expected_times = [(value - times[0]) / 1000 for value in times]
    max_error = max(abs(actual - expected) for actual, expected in zip(encoded_times, expected_times))
    if max_error > 0.0011:
        raise RuntimeError(f"Encoder changed recorded frame intervals: {max_error} seconds")
    evidence = {
        "video": video.name,
        "capture_count": len(frames),
        "encoded_frame_count": len(encoded_times),
        "recorded_span_seconds": expected_times[-1],
        "max_timestamp_error_seconds": max_error,
        "interpolated_frames": 0,
        "speed_changed": False,
        "source": "actual Godot game viewport captures",
        "note": "Capture is capped at 10 Hz and has diagnostic GPU readback overhead. Original wall-clock gaps are preserved; this is not an FPS benchmark. The final captured frame has a 1 ms container tail.",
        "frames": frames,
    }
    (directory / "knight-gameplay-video.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in evidence.items() if key != "frames"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
