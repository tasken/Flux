#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the static Flux site.")
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT_DIR / "dist",
        help="Output directory. Default: dist",
    )
    return parser.parse_args()


def read_git(*args: str, fallback: str = "") -> str:
    try:
        return subprocess.run(
            ["git", *args],
            cwd=ROOT_DIR,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        return fallback


def build_info_source() -> str:
    commit_hash = read_git("rev-parse", "--short=7", "HEAD", fallback="DEV")
    commit_branch = os.environ.get("FLUX_COMMIT_BRANCH") or read_git("branch", "--show-current")
    art_timezone = timezone(timedelta(hours=-3))
    build_time = datetime.now(art_timezone).isoformat(timespec="minutes")
    values = {
        "commitHash": commit_hash,
        "commitBranch": commit_branch,
        "buildTime": build_time,
    }
    return f"export const buildInfo = Object.freeze({json.dumps(values, indent=2)})\n"


def main() -> None:
    args = parse_args()
    output_dir = args.output.resolve()
    if output_dir in {Path(output_dir.anchor), ROOT_DIR}:
        raise SystemExit(f"Refusing unsafe output directory: {output_dir}")

    if output_dir.exists():
        shutil.rmtree(output_dir)

    output_dir.mkdir(parents=True)
    shutil.copy2(ROOT_DIR / "index.html", output_dir / "index.html")
    shutil.copytree(ROOT_DIR / "src", output_dir / "src")
    (output_dir / "src" / "build-info.js").write_text(
        build_info_source(),
        encoding="utf8",
    )
    (output_dir / ".nojekyll").touch()
    print(f"Built static site in {output_dir}")


if __name__ == "__main__":
    main()