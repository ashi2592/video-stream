from models_pymongo import update_video_status, VideoStatus

def process_video(video_id: str, input_path: str, output_dir: str) -> dict:
    try:
        update_video_status(video_id, VideoStatus.PROCESSING)

        os.makedirs(f"{output_dir}/hls", exist_ok=True)
        os.makedirs(f"{output_dir}/mp4", exist_ok=True)
        os.makedirs(f"{output_dir}/webm", exist_ok=True)

        mp4_out  = f"{output_dir}/mp4/output.mp4"
        hls_out  = f"{output_dir}/hls/master.m3u8"
        webm_out = f"{output_dir}/webm/output.webm"

        short_id = video_id[:8]

        vf_filter = (
            "scale=1280:720:force_original_aspect_ratio=decrease,"
            "pad=1280:720:(ow-iw)/2:(oh-ih)/2,"
            f"drawtext=text='{short_id}':"
            "fontsize=18:fontcolor=white@0.75:"
            "x=20:y=20:"
            "box=1:boxcolor=black@0.45:boxborderw=6,"
            "drawtext=text='%{pts\\:localtime\\:0\\:%Y-%m-%d %H\\\\\\:%M\\\\\\:%S}':"
            "fontsize=13:fontcolor=white@0.6:"
            "x=w-tw-20:y=20"
        )

        # STEP 1
        _run([
            "ffmpeg", "-i", input_path,
            "-vf", vf_filter,
            "-c:v", "libx264",
            "-crf", "23",
            "-preset", "fast",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            mp4_out, "-y"
        ], "MP4 compression")

        # STEP 2
        update_video_status(video_id, VideoStatus.PROCESSING)

        _run([...], "HLS generation")  # keep your same command

        # STEP 3
        _run([...], "WebM generation")

        update_video_status(video_id, VideoStatus.READY)

        return {"mp4": mp4_out, "hls": hls_out, "webm": webm_out}

    except Exception as e:
        update_video_status(video_id, VideoStatus.FAILED, str(e))
        raise