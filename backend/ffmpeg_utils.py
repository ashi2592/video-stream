import os
from mongo_model import update_video_status, VideoStatus

def process_video(video_id: str, input_path: str, output_dir: str) -> dict:
    try:
        update_video_status(video_id, VideoStatus.PROCESSING)

        # ── Directories ─────────────────────────────
        hls_dir  = os.path.join(output_dir, "hls")
        mp4_dir  = os.path.join(output_dir, "mp4")
        webm_dir = os.path.join(output_dir, "webm")

        os.makedirs(hls_dir, exist_ok=True)
        os.makedirs(mp4_dir, exist_ok=True)
        os.makedirs(webm_dir, exist_ok=True)

        mp4_out  = os.path.join(mp4_dir, "output.mp4")
        hls_out  = os.path.join(hls_dir, "master.m3u8")
        webm_out = os.path.join(webm_dir, "output.webm")

        short_id = video_id[:8]

        # ── Filter ──────────────────────────────────
        vf_filter = (
            "scale=1280:720:force_original_aspect_ratio=decrease,"
            "pad=1280:720:(ow-iw)/2:(oh-ih)/2,"
            f"drawtext=text='{short_id}':"
            "fontsize=18:fontcolor=white@0.75:"
            "x=20:y=20:"
            "box=1:boxcolor=black@0.45:boxborderw=6"
        )

        # Convert paths → /work (Docker)
        base_dir = os.getcwd()
        rel_input = os.path.relpath(input_path, base_dir)
        rel_mp4   = os.path.relpath(mp4_out, base_dir)
        rel_hls   = os.path.relpath(hls_out, base_dir)
        rel_webm  = os.path.relpath(webm_out, base_dir)

        docker_input = f"/work/{rel_input}"
        docker_mp4   = f"/work/{rel_mp4}"
        docker_hls   = f"/work/{rel_hls}"
        docker_webm  = f"/work/{rel_webm}"

        # =========================================================
        # ✅ STEP 1: STANDARD MP4
        # =========================================================
        _run([
            "-i", docker_input,
            "-vf", vf_filter,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-c:a", "aac",
            "-b:a", "128k",
            docker_mp4,
            "-y"
        ], "MP4 compression")

        # =========================================================
        # ✅ STEP 2: HLS
        # =========================================================
        _run([
            "-i", docker_mp4,
            "-c", "copy",
            "-start_number", "0",
            "-hls_time", "6",
            "-hls_list_size", "0",
            "-f", "hls",
            docker_hls
        ], "HLS generation")

        # =========================================================
        # ✅ STEP 3: WEBM
        # =========================================================
        _run([
            "-i", docker_mp4,
            "-c:v", "libvpx-vp9",
            "-b:v", "1M",
            "-c:a", "libopus",
            docker_webm
        ], "WebM generation")

        update_video_status(video_id, VideoStatus.READY)

        return {
            "mp4": mp4_out,
            "hls": hls_out,
            "webm": webm_out
        }

    except Exception as e:
        update_video_status(video_id, VideoStatus.FAILED, str(e))
        raise