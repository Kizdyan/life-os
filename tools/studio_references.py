"""Discover explicitly provided reference media and cleared audio assets."""
import os
from pathlib import Path

VIDEO = {".mp4", ".mov", ".m4v", ".mkv", ".webm"}
AUDIO = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"}
REFERENCE_FOLDERS = ("color_ref", "edit_ref", "subtitle_ref", "audio_ref")


def default_reference_root():
    configured = os.environ.get("PERSONA_STUDIO_REFERENCE_DIR")
    return Path(configured) if configured else Path("G:/test-persona/reference_videos")


def media_files(root, folder, extensions, limit):
    directory = root / folder
    if not directory.is_dir():
        return ()
    base = root.resolve(strict=True)
    if directory.resolve(strict=True) != base / Path(folder):
        raise ValueError(f"Reference directory must be inside the configured root: {folder}")
    files = tuple(p.resolve(strict=True) for p in sorted(directory.iterdir())
                  if p.suffix.lower() in extensions and p.is_file() and not p.is_symlink())
    if any(path.parent != directory.resolve() for path in files):
        raise ValueError("Reference file must be inside its category")
    if len(files) > limit:
        raise ValueError(f"Choose at most {limit} active items in {folder}")
    return files


def reference_library(root):
    return {folder: media_files(root, folder, VIDEO | AUDIO if folder == "audio_ref" else VIDEO, 2)
            for folder in REFERENCE_FOLDERS}


def sound_library(root):
    # Putting a standalone asset in music/ or sfx/ declares it cleared for this edit.
    assets = {}
    for kind in ("music", "sfx"):
        for number, path in enumerate(media_files(root, f"audio_ref/{kind}", AUDIO, 3), 1):
            assets[f"{kind}-{number}"] = path
    return assets
