#!/usr/bin/env python3
"""Validate one complete built-in profession theme asset package."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from pathlib import Path


THEME_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
RASTER_SPECS = {
    "background.webp": ((1920, 1280), 500_000, False),
    "character.webp": ((1200, 1280), 1_200_000, True),
    "log-character.webp": ((384, 384), 250_000, True),
    "preview.webp": ((480, 300), 120_000, False),
    "paper-noise.webp": ((512, 512), 100_000, False),
}
SVG_SPECS = {
    "corner-top-right.svg": 30_000,
    "corner-bottom-left.svg": 30_000,
}
TOTAL_LIMIT = 2_000_000
FORBIDDEN_SVG_TAGS = {"script", "image", "data", "foreignobject", "filter"}
FORBIDDEN_SVG_TEXT = ("data:", "javascript:", "@import", "url(", "<!doctype", "<!entity")


@dataclass
class AssetResult:
    name: str
    size_bytes: int
    dimensions: str | None = None
    channels: str | None = None
    colorspace: str | None = None
    format: str | None = None


def configure_output() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def find_repo_root(explicit: Path | None) -> Path:
    candidates = []
    if explicit is not None:
        candidates.append(explicit.resolve())
    candidates.extend([Path.cwd().resolve(), Path(__file__).resolve()])

    for candidate in candidates:
        current = candidate if candidate.is_dir() else candidate.parent
        for directory in (current, *current.parents):
            if (directory / "package.json").is_file() and (directory / "src" / "themes").is_dir():
                return directory
    raise RuntimeError("cannot locate repository root; pass --repo-root")


def run_magick(magick: str, arguments: list[str]) -> str:
    try:
        process = subprocess.run(
            [magick, *arguments],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError("ImageMagick timed out after 30 seconds") from error
    except OSError as error:
        raise RuntimeError(f"cannot start ImageMagick: {error}") from error
    if process.returncode != 0:
        detail = process.stderr.strip() or process.stdout.strip() or "unknown ImageMagick error"
        raise RuntimeError(detail)
    return process.stdout.strip()


def identify_raster(magick: str, path: Path) -> tuple[int, int, str, str, str, str]:
    output = run_magick(
        magick,
        [
            "identify",
            "-quiet",
            "-format",
            "%w|%h|%[channels]|%[colorspace]|%m|%[opaque]\n",
            str(path),
        ]
    )
    lines = output.splitlines()
    if len(lines) != 1:
        raise RuntimeError(f"expected one image frame, got {len(lines)}")
    parts = lines[0].split("|")
    if len(parts) != 6:
        raise RuntimeError(f"unexpected identify output: {output!r}")
    width, height, channels, colorspace, image_format, opaque = parts
    return (
        int(width),
        int(height),
        channels.strip(),
        colorspace.strip(),
        image_format.strip(),
        opaque.strip(),
    )


def corner_alpha(magick: str, path: Path, width: int, height: int) -> list[float]:
    output = run_magick(
        magick,
        [
            str(path),
            "-format",
            (
                f"%[fx:p{{0,0}}.a]|%[fx:p{{{width - 1},0}}.a]|"
                f"%[fx:p{{0,{height - 1}}}.a]|%[fx:p{{{width - 1},{height - 1}}}.a]"
            ),
            "info:",
        ]
    )
    return [float(value) for value in output.split("|")]


def local_name(value: str) -> str:
    return value.rsplit("}", 1)[-1].lower()


def validate_svg(path: Path, errors: list[str]) -> None:
    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.append(f"{path.name}: SVG must be UTF-8 text")
        return

    lowered = raw.lower()
    for token in FORBIDDEN_SVG_TEXT:
        if token in lowered:
            errors.append(f"{path.name}: forbidden SVG content {token!r}")

    try:
        root = ET.fromstring(raw)
    except ET.ParseError as error:
        errors.append(f"{path.name}: invalid XML ({error})")
        return

    if local_name(root.tag) != "svg":
        errors.append(f"{path.name}: root element must be <svg>")
    if not root.attrib.get("viewBox"):
        errors.append(f"{path.name}: missing viewBox")

    for element in root.iter():
        tag = local_name(element.tag)
        if tag in FORBIDDEN_SVG_TAGS:
            errors.append(f"{path.name}: forbidden <{tag}> element")
        for attribute, value in element.attrib.items():
            name = local_name(attribute)
            lowered_value = value.strip().lower()
            if name == "href" or name.startswith("on"):
                errors.append(f"{path.name}: forbidden attribute {name}")
            if lowered_value.startswith(("http:", "https:", "file:", "data:", "javascript:")):
                errors.append(f"{path.name}: forbidden external or embedded resource")


def validate(
    theme_id: str, repo_root: Path, magick: str
) -> tuple[list[AssetResult], list[str], list[str], int]:
    errors: list[str] = []
    warnings: list[str] = []
    results: list[AssetResult] = []
    assets_dir = repo_root / "src" / "themes" / theme_id / "assets"

    if not assets_dir.is_dir():
        return results, [f"asset directory does not exist: {assets_dir}"], warnings, 0

    expected_names = set(RASTER_SPECS) | set(SVG_SPECS)
    entries = list(assets_dir.iterdir())
    actual_files = {path.name for path in entries if path.is_file()}
    missing = sorted(expected_names - actual_files)
    extra = sorted(actual_files - expected_names)
    for name in missing:
        errors.append(f"missing required asset: {name}")
    for name in extra:
        errors.append(f"unexpected file in final asset directory: {name}")
    for entry in entries:
        if entry.is_symlink():
            errors.append(f"symbolic links are not allowed in final assets: {entry.name}")
        elif not entry.is_file():
            errors.append(f"unexpected directory or special entry: {entry.name}")

    for name, (dimensions, size_limit, requires_alpha) in RASTER_SPECS.items():
        path = assets_dir / name
        if not path.is_file():
            continue
        size = path.stat().st_size
        result = AssetResult(name=name, size_bytes=size)
        results.append(result)
        if size > size_limit:
            errors.append(f"{name}: {size} B exceeds {size_limit} B")
        try:
            width, height, channels, colorspace, image_format, opaque = identify_raster(magick, path)
            result.dimensions = f"{width}x{height}"
            result.channels = channels
            result.colorspace = colorspace
            result.format = image_format
        except (RuntimeError, ValueError) as error:
            errors.append(f"{name}: cannot inspect raster ({error})")
            continue

        if (width, height) != dimensions:
            errors.append(f"{name}: expected {dimensions[0]}x{dimensions[1]}, got {width}x{height}")
        if image_format.upper() != "WEBP":
            errors.append(f"{name}: expected WEBP, got {image_format}")
        if colorspace.lower() != "srgb":
            errors.append(f"{name}: expected sRGB colorspace, got {colorspace}")

        channel_word = channels.lower().split()[0]
        has_alpha = channel_word in {"rgba", "srgba"}
        if name == "log-character.webp":
            valid_channel_words = {"srgba"}
        else:
            valid_channel_words = {"rgba", "srgba"} if requires_alpha else {"rgb", "srgb"}
        if channel_word not in valid_channel_words:
            if name == "log-character.webp":
                expected = "sRGBA"
            else:
                expected = "RGBA/sRGBA" if requires_alpha else "RGB/sRGB"
            errors.append(f"{name}: expected {expected} channels, got {channels}")
        if requires_alpha and not has_alpha:
            errors.append(f"{name}: alpha channel is required")
        if not requires_alpha and has_alpha:
            errors.append(f"{name}: unexpected alpha channel")
        if requires_alpha and opaque.lower() != "false":
            errors.append(f"{name}: image must contain transparent pixels")

        if name in {"character.webp", "log-character.webp"} and has_alpha:
            try:
                alpha_values = corner_alpha(magick, path, width, height)
                if any(value > 0 for value in alpha_values):
                    errors.append(
                        f"{name}: all four canvas corners must be fully transparent "
                        f"(got {alpha_values})"
                    )
            except (RuntimeError, ValueError) as error:
                errors.append(f"{name}: cannot inspect corner alpha ({error})")

    for name, size_limit in SVG_SPECS.items():
        path = assets_dir / name
        if not path.is_file():
            continue
        size = path.stat().st_size
        results.append(AssetResult(name=name, size_bytes=size, format="SVG"))
        if size > size_limit:
            errors.append(f"{name}: {size} B exceeds {size_limit} B")
            continue
        validate_svg(path, errors)

    total_size = sum(path.stat().st_size for path in entries if path.is_file())
    if total_size > TOTAL_LIMIT:
        errors.append(f"theme asset total {total_size} B exceeds {TOTAL_LIMIT} B")

    return results, errors, warnings, total_size


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("theme_id", help="lowercase ASCII theme ID, for example xuehe")
    parser.add_argument("--repo-root", type=Path, help="repository root; auto-detected by default")
    parser.add_argument("--magick", help="ImageMagick executable; defaults to magick from PATH")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    return parser.parse_args()


def main() -> int:
    configure_output()
    args = parse_args()
    theme_id = args.theme_id.strip()
    if not THEME_ID_PATTERN.fullmatch(theme_id):
        print(f"[ERROR] invalid theme ID: {theme_id!r}", file=sys.stderr)
        return 2

    try:
        repo_root = find_repo_root(args.repo_root)
    except RuntimeError as error:
        print(f"[ERROR] {error}", file=sys.stderr)
        return 2

    magick = args.magick or shutil.which("magick")
    if not magick:
        print("[ERROR] ImageMagick command 'magick' was not found in PATH", file=sys.stderr)
        return 2
    try:
        run_magick(magick, ["-version"])
    except RuntimeError as error:
        print(f"[ERROR] ImageMagick is unavailable: {error}", file=sys.stderr)
        return 2

    results, errors, warnings, total_size = validate(theme_id, repo_root, magick)

    if args.json:
        print(
            json.dumps(
                {
                    "themeId": theme_id,
                    "repoRoot": str(repo_root),
                    "assets": [asdict(result) for result in results],
                    "totalSizeBytes": total_size,
                    "warnings": warnings,
                    "errors": errors,
                    "ok": not errors,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        for result in results:
            details = [f"{result.size_bytes} B"]
            if result.dimensions:
                details.append(result.dimensions)
            if result.channels:
                details.append(result.channels)
            print(f"[OK] {result.name}: {', '.join(details)}")
        for warning in warnings:
            print(f"[WARN] {warning}")
        for error in errors:
            print(f"[ERROR] {error}")
        print(f"Total: {total_size} B / {TOTAL_LIMIT} B")
        if not errors:
            print("Asset package validation passed.")
            print("Manual review still required: composition, text-like artifacts, and edge quality.")

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
