#!/usr/bin/env python3
"""
Derive a perceptual density ramp from rendered glyph coverage.

Examples:
  python3 scripts/derive_density_ramp.py \
    --steps 12 \
    --font-path /path/to/IBMPlexMono-Regular.ttf

  python3 scripts/derive_density_ramp.py \
    --steps 16 \
    --font-family "IBM Plex Mono"

When using --chars-file, provide one glyph per line if you need multi-codepoint
graphemes such as emoji sequences.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
import unicodedata
import zipfile
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ModuleNotFoundError as exc:
    raise SystemExit(
        "This script requires Pillow. Install it with:\n"
        "  python3 -m pip install pillow"
    ) from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=False)
    source.add_argument("--chars", help="Raw string of glyphs to evaluate.")
    source.add_argument(
        "--chars-file",
        type=Path,
        help="Text file containing glyphs. Prefer one glyph per line for complex Unicode.",
    )
    parser.add_argument("--steps", type=int, required=True, help="Number of ramp steps to output.")
    parser.add_argument("--font-path", type=Path, help="Path to a .ttf/.otf font file.")
    parser.add_argument(
        "--font-member",
        help="Font file inside a zip archive when --font-path points to a .zip.",
    )
    parser.add_argument(
        "--font-family",
        default="IBM Plex Mono",
        help="Family name to resolve with fc-match when --font-path is omitted.",
    )
    parser.add_argument("--font-size", type=int, default=12, help="Font size in pixels.")
    parser.add_argument(
        "--metric",
        choices=("perceptual", "ink"),
        default="perceptual",
        help="Weighting metric used to sort glyphs. Default: perceptual.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print full JSON payload instead of the compact ramp string.",
    )
    parser.add_argument(
        "--keep-zero-coverage",
        action="store_true",
        help="Keep glyphs that render with zero measured coverage.",
    )
    parser.add_argument(
        "--filter",
        choices=("ascii", "latin", "blocks", "terminal-safe", "all"),
        default="ascii",
        help="Candidate glyph filter to apply before measuring. Default: ascii.",
    )
    parser.add_argument(
        "--style",
        choices=("raw", "ascii-clean", "ascii-ramp"),
        default="ascii-clean",
        help="Aesthetic post-filter to apply after the charset filter. Default: ascii-clean.",
    )
    return parser.parse_args()


def split_unique_glyphs(chars: str) -> list[str]:
    return list(dict.fromkeys(list(chars)))


def parse_fc_charset(charset_text: str) -> list[str]:
    codepoints: list[int] = []
    for token in charset_text.split():
        if "-" in token:
            start_hex, end_hex = token.split("-", 1)
            start = int(start_hex, 16)
            end = int(end_hex, 16)
            codepoints.extend(range(start, end + 1))
        else:
            codepoints.append(int(token, 16))
    return [chr(codepoint) for codepoint in codepoints]


def enumerate_font_glyphs(font_path: Path) -> list[str]:
    fc_query = shutil.which("fc-query")
    if not fc_query:
        raise SystemExit(
            "No glyph source was provided and fc-query is unavailable.\n"
            "Pass --chars/--chars-file or install fontconfig."
        )

    proc = subprocess.run(
        [fc_query, "--format=%{charset}\n", str(font_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    glyphs = list(dict.fromkeys(parse_fc_charset(proc.stdout.strip())))
    if glyphs:
        return glyphs
    raise SystemExit(f"No glyph coverage could be enumerated from {font_path}")


def read_glyphs(args: argparse.Namespace, font_path: Path) -> list[str]:
    if args.chars is not None:
        glyphs = split_unique_glyphs(args.chars)
        if glyphs:
            return glyphs
        raise SystemExit("`--chars` did not contain any glyphs.")

    if args.chars_file is not None:
        text = args.chars_file.read_text(encoding="utf8")
        lines = [line.rstrip("\n") for line in text.splitlines()]
        non_empty_lines = [line for line in lines if line]
        if non_empty_lines:
            return list(dict.fromkeys(non_empty_lines))

        glyphs = split_unique_glyphs(text)
        if glyphs:
            return glyphs
        raise SystemExit("`--chars-file` did not contain any glyphs.")

    return enumerate_font_glyphs(font_path)


def is_terminal_safe_glyph(glyph: str) -> bool:
    if len(glyph) != 1:
        return False
    codepoint = ord(glyph)
    if glyph == " ":
        return True
    if glyph.isspace():
        return False

    category = unicodedata.category(glyph)
    if category[0] in {"C", "M"}:
        return False
    if unicodedata.east_asian_width(glyph) in {"W", "F"}:
        return False

    return (
        0x21 <= codepoint <= 0x7E or
        0xA0 <= codepoint <= 0xFF or
        0x2500 <= codepoint <= 0x257F or
        0x2580 <= codepoint <= 0x259F or
        0x25A0 <= codepoint <= 0x25FF
    )


def is_ascii_glyph(glyph: str) -> bool:
    return len(glyph) == 1 and (glyph == " " or 0x21 <= ord(glyph) <= 0x7E)


def is_latin_glyph(glyph: str) -> bool:
    return len(glyph) == 1 and (glyph == " " or 0x21 <= ord(glyph) <= 0xFF)


def is_block_glyph(glyph: str) -> bool:
    return len(glyph) == 1 and (
        0x2500 <= ord(glyph) <= 0x257F or
        0x2580 <= ord(glyph) <= 0x259F or
        0x25A0 <= ord(glyph) <= 0x25FF
    )


def filter_glyphs(glyphs: list[str], mode: str) -> list[str]:
    if mode == "all":
        return glyphs
    if mode == "ascii":
        return [glyph for glyph in glyphs if is_ascii_glyph(glyph)]
    if mode == "latin":
        return [glyph for glyph in glyphs if is_latin_glyph(glyph)]
    if mode == "blocks":
        return [glyph for glyph in glyphs if is_block_glyph(glyph)]
    if mode == "terminal-safe":
        return [glyph for glyph in glyphs if is_terminal_safe_glyph(glyph)]
    raise SystemExit(f"Unsupported filter mode: {mode}")


def apply_style_filter(glyphs: list[str], style: str) -> list[str]:
    if style == "raw":
        return glyphs

    if style == "ascii-clean":
        excluded = set("`'\"[]{}()/\\\\|")
        return [
            glyph for glyph in glyphs
            if glyph == " " or glyph not in excluded
        ]

    if style == "ascii-ramp":
        excluded = set("`'\"[]{}()/\\\\|")
        allowed_letters = set("MWXKAHDBQ")
        allowed_digits = set("0123456789")
        return [
            glyph for glyph in glyphs
            if (
                glyph == " " or
                glyph in allowed_digits or
                glyph in allowed_letters or
                (not glyph.isalpha() and glyph not in excluded)
            )
        ]

    raise SystemExit(f"Unsupported style mode: {style}")


def resolve_font_path(font_path: Path | None, font_family: str) -> Path:
    if font_path is not None:
        if not font_path.exists():
            raise SystemExit(f"Font file not found: {font_path}")
        return font_path

    fc_match = shutil.which("fc-match")
    if not fc_match:
        raise SystemExit(
            "No --font-path was provided and fc-match is unavailable.\n"
            "Pass --font-path /path/to/font.ttf"
        )

    proc = subprocess.run(
        [fc_match, font_family, "--format=%{file}\n"],
        check=True,
        capture_output=True,
        text=True,
    )
    resolved = Path(proc.stdout.strip())
    if not resolved.exists():
        raise SystemExit(
            f"Could not resolve a font file for family {font_family!r}.\n"
            "Pass --font-path /path/to/font.ttf"
        )
    return resolved


def choose_zip_font_member(archive: zipfile.ZipFile, requested_member: str | None) -> str:
    font_members = [
        name for name in archive.namelist()
        if name.lower().endswith((".ttf", ".otf"))
    ]
    if not font_members:
        raise SystemExit("The zip archive does not contain any .ttf or .otf files.")

    if requested_member is not None:
        if requested_member in font_members:
            return requested_member
        basename_matches = [name for name in font_members if Path(name).name == requested_member]
        if len(basename_matches) == 1:
            return basename_matches[0]
        raise SystemExit(
            f"Could not find font member {requested_member!r} in the zip archive."
        )

    preferred_patterns = (
        "regular.ttf",
        "regular.otf",
        "regular",
    )
    for pattern in preferred_patterns:
        for name in font_members:
            lower_name = Path(name).name.lower()
            if pattern in lower_name and "italic" not in lower_name:
                return name

    return sorted(font_members)[0]


def materialize_font_path(font_path: Path, font_member: str | None, temp_dir: Path) -> tuple[Path, str]:
    if font_path.suffix.lower() != ".zip":
        return font_path, font_path.name

    with zipfile.ZipFile(font_path) as archive:
        member = choose_zip_font_member(archive, font_member)
        extracted_path = temp_dir / Path(member).name
        extracted_path.write_bytes(archive.read(member))
        return extracted_path, member


def build_measure_context(glyphs: list[str], font: ImageFont.FreeTypeFont, font_size: int) -> dict[str, object]:
    padding = max(4, round(font_size * 0.5))
    lefts: list[int] = []
    tops: list[int] = []
    rights: list[int] = []
    bottoms: list[int] = []
    advances: list[float] = []

    for glyph in glyphs:
        left, top, right, bottom = font.getbbox(glyph)
        lefts.append(left)
        tops.append(top)
        rights.append(right)
        bottoms.append(bottom)
        advances.append(font.getlength(glyph))

    cell_left = min(lefts) if lefts else 0
    cell_top = min(tops) if tops else 0
    cell_right = max(rights) if rights else font_size
    cell_bottom = max(bottoms) if bottoms else font_size
    cell_width = max(
        1,
        int(math.ceil(max([cell_right - cell_left, *advances], default=font_size) + padding * 2)),
    )
    cell_height = max(1, int(math.ceil(cell_bottom - cell_top + padding * 2)))

    weight_size = 32
    center = (weight_size - 1) * 0.5
    sigma = weight_size * 0.24
    weights: list[float] = []
    for y in range(weight_size):
        for x in range(weight_size):
            dx = (x - center) / sigma
            dy = (y - center) / sigma
            weights.append(math.exp(-0.5 * (dx * dx + dy * dy)))
    weight_sum = sum(weights) or 1.0

    return {
        "padding": padding,
        "cell_left": cell_left,
        "cell_top": cell_top,
        "cell_width": cell_width,
        "cell_height": cell_height,
        "weight_size": weight_size,
        "weights": weights,
        "weight_sum": weight_sum,
    }


def measure_glyph_weight(
    glyph: str,
    font: ImageFont.FreeTypeFont,
    font_size: int,
    context: dict[str, object],
) -> dict[str, int | float | str]:
    padding = int(context["padding"])
    cell_left = int(context["cell_left"])
    cell_top = int(context["cell_top"])
    cell_width = int(context["cell_width"])
    cell_height = int(context["cell_height"])

    image = Image.new("L", (cell_width, cell_height), 0)
    draw = ImageDraw.Draw(image)
    draw.text((padding - cell_left, padding - cell_top), glyph, fill=255, font=font)

    histogram = image.histogram()
    ink_coverage = sum(value * count for value, count in enumerate(histogram))
    normalized_ink = ink_coverage / max(1.0, 255.0 * cell_width * cell_height)

    reduced = image.resize(
        (int(context["weight_size"]), int(context["weight_size"])),
        Image.Resampling.BILINEAR,
    )
    reduced_histogram = reduced.histogram()
    reduced_values = [
        value / 255.0
        for value, count in enumerate(reduced_histogram)
        for _ in range(count)
    ]
    perceptual_sum = 0.0
    weights = context["weights"]
    for weight, value in zip(weights, reduced_values):
        perceptual_sum += weight * math.sqrt(value)
    perceptual_weight = (
        0.55 * normalized_ink +
        0.45 * (perceptual_sum / float(context["weight_sum"]))
    )

    return {
        "glyph": glyph,
        "inkCoverage": ink_coverage,
        "weight": perceptual_weight,
        "width": cell_width,
        "height": cell_height,
    }


def classify_ramp_glyph(glyph: str) -> str:
    if glyph == " ":
        return "space"
    if glyph.isdigit():
        return "digit"
    if glyph.isalpha():
        return "upper" if glyph.isupper() else "lower"
    if glyph in "#$%&@":
        return "heavy-symbol"
    if glyph in ".,-_:;!~^+*=<>?":
        return "light-symbol"
    return "other"


def ramp_category_penalty(glyph: str, progress: float) -> float:
    category = classify_ramp_glyph(glyph)
    if category == "space":
        return 0.0 if progress <= 0.05 else 4.0
    if category == "light-symbol":
        return max(0.0, progress - 0.72) * 0.35
    if category == "heavy-symbol":
        return max(0.0, 0.82 - progress) * 0.45
    if category == "digit":
        return max(0.0, 0.30 - progress) * 0.55
    if category == "upper":
        return max(0.0, 0.46 - progress) * 0.45
    if category == "lower":
        return max(0.0, 0.58 - progress) * 0.60
    return 0.18


def ramp_category_penalty_for_style(glyph: str, progress: float, style: str) -> float:
    base = ramp_category_penalty(glyph, progress)
    if style != "ascii-ramp":
        return base

    category = classify_ramp_glyph(glyph)
    if category == "light-symbol":
        return base - 0.08
    if category == "digit":
        return base + max(0.0, 0.38 - progress) * 0.22
    if category == "upper":
        return base + max(0.0, 0.62 - progress) * 0.28
    if category == "heavy-symbol":
        return base + max(0.0, 0.72 - progress) * 0.12
    return base


def ramp_continuity_penalty(previous_glyph: str | None, glyph: str, progress: float, style: str) -> float:
    if previous_glyph is None:
        return 0.0

    prev_category = classify_ramp_glyph(previous_glyph)
    category = classify_ramp_glyph(glyph)
    if prev_category == category:
        return -0.05

    if prev_category == "light-symbol" and category in {"upper", "lower"} and progress < 0.6:
        return 0.18
    if prev_category in {"upper", "lower"} and category == "light-symbol" and progress > 0.55:
        return 0.12
    if prev_category == "digit" and category in {"upper", "lower"} and progress < 0.7:
        return 0.08

    base = 0.03
    if style == "ascii-ramp" and prev_category == "light-symbol" and category in {"digit", "upper"}:
        return base + 0.08
    return base


def pick_representative_steps(
    entries: list[dict[str, int | float | str]],
    steps: int,
    style: str,
) -> list[dict[str, int | float | str]]:
    if steps <= 0:
        raise SystemExit("`--steps` must be a positive integer.")
    if steps >= len(entries):
        return entries[:]
    if steps == 1:
        return [entries[(len(entries) - 1) // 2]]

    picked: list[dict[str, int | float | str]] = []
    last_index = len(entries) - 1
    value_min = float(entries[0]["sortValue"])
    value_max = float(entries[-1]["sortValue"])
    value_span = max(1e-9, value_max - value_min)
    search_radius = max(3, math.ceil(len(entries) / max(steps * 1.5, 1)))
    previous_index = -1
    previous_glyph: str | None = None

    for i in range(steps):
        target = round(i * last_index / (steps - 1))
        remaining = steps - i - 1
        min_index = previous_index + 1
        max_index = last_index - remaining
        progress = i / max(1, steps - 1)
        target_value = float(entries[target]["sortValue"])

        search_start = max(min_index, target - search_radius)
        search_end = min(max_index, target + search_radius)
        if search_start > search_end:
            search_start = min_index
            search_end = max_index

        best_index = search_start
        best_score = float("inf")
        for index in range(search_start, search_end + 1):
            entry = entries[index]
            glyph = str(entry["glyph"])
            index_cost = abs(index - target) / max(1, search_radius)
            value_cost = abs(float(entry["sortValue"]) - target_value) / value_span
            category_cost = ramp_category_penalty_for_style(glyph, progress, style)
            continuity_cost = ramp_continuity_penalty(previous_glyph, glyph, progress, style)
            score = index_cost * 0.85 + value_cost * 1.15 + category_cost + continuity_cost
            if score < best_score:
                best_score = score
                best_index = index

        picked.append(entries[best_index])
        previous_index = best_index
        previous_glyph = str(entries[best_index]["glyph"])

    return sorted(picked, key=lambda entry: float(entry["sortValue"]))


def main() -> int:
    args = parse_args()
    font_source = resolve_font_path(args.font_path, args.font_family)

    with tempfile.TemporaryDirectory(prefix="density-ramp-font-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        font_path, font_member = materialize_font_path(font_source, args.font_member, temp_dir)
        glyphs = filter_glyphs(read_glyphs(args, font_path), args.filter)
        glyphs = apply_style_filter(glyphs, args.style)
        if not glyphs:
            raise SystemExit(
                f"No glyphs remained after applying filter {args.filter!r} and style {args.style!r}."
            )
        font = ImageFont.truetype(str(font_path), args.font_size)
        measure_context = build_measure_context(glyphs, font, args.font_size)

        measured = [
            measure_glyph_weight(glyph, font, args.font_size, measure_context)
            for glyph in glyphs
        ]
        if not args.keep_zero_coverage:
            measured = [
                entry for entry in measured
                if int(entry["inkCoverage"]) > 0 or str(entry["glyph"]).isspace()
            ]
        if not measured:
            raise SystemExit("No renderable glyphs remained after coverage filtering.")
        for entry in measured:
            entry["sortValue"] = (
                float(entry["weight"])
                if args.metric == "perceptual"
                else float(entry["inkCoverage"])
            )
        measured.sort(key=lambda entry: (float(entry["sortValue"]), str(entry["glyph"])))
        ramp = pick_representative_steps(measured, args.steps, args.style)

        payload = {
            "fontSource": str(font_source),
            "fontMember": font_member,
            "fontPath": str(font_path),
            "fontFamily": args.font_family,
            "fontSize": args.font_size,
            "metric": args.metric,
            "filter": args.filter,
            "style": args.style,
            "inputCount": len(glyphs),
            "outputCount": len(ramp),
            "sortedChars": "".join(str(entry["glyph"]) for entry in measured),
            "rampChars": "".join(str(entry["glyph"]) for entry in ramp),
            "entries": [
                {
                    "glyph": entry["glyph"],
                    "weight": entry["weight"],
                    "inkCoverage": entry["inkCoverage"],
                }
                for entry in ramp
            ],
        }

        if args.json:
            json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
            sys.stdout.write("\n")
        else:
            print(payload["rampChars"])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
