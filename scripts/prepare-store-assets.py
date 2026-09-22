from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def crop_to_ratio(image: Image.Image, target_ratio: float) -> Image.Image:
    width, height = image.size
    current_ratio = width / height
    if current_ratio > target_ratio:
        crop_width = round(height * target_ratio)
        left = (width - crop_width) // 2
        return image.crop((left, 0, left + crop_width, height))

    crop_height = round(width / target_ratio)
    top = (height - crop_height) // 2
    return image.crop((0, top, width, top + crop_height))


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepara artes da ficha da Google Play.")
    parser.add_argument("--icon-source", type=Path, required=True)
    parser.add_argument("--feature-source", type=Path, required=True)
    parser.add_argument("--assets-dir", type=Path, required=True)
    args = parser.parse_args()

    assets_dir = args.assets_dir.resolve()
    screenshots_dir = assets_dir / "screenshots"
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    icon = Image.open(args.icon_source).convert("RGBA")
    icon = icon.resize((512, 512), Image.Resampling.LANCZOS)
    icon_background = Image.new("RGBA", icon.size, (5, 12, 42, 255))
    icon = Image.alpha_composite(icon_background, icon)
    icon.save(
        assets_dir / "app-icon-512.png",
        optimize=True,
    )

    feature = Image.open(args.feature_source).convert("RGB")
    feature = crop_to_ratio(feature, 1024 / 500)
    feature.resize((1024, 500), Image.Resampling.LANCZOS).save(
        assets_dir / "feature-graphic-1024x500.png",
        optimize=True,
    )

    for source in screenshots_dir.glob("*-source.png"):
        screenshot = Image.open(source).convert("RGB")
        screenshot.resize((1080, 1920), Image.Resampling.LANCZOS).save(
            screenshots_dir / source.name.replace("-source", ""),
            optimize=True,
        )

    for image_path in sorted(assets_dir.rglob("*.png")):
        image = Image.open(image_path)
        relative = image_path.relative_to(assets_dir)
        print(
            f"{relative} | {image.width}x{image.height} | "
            f"{image.mode} | {image_path.stat().st_size} bytes"
        )


if __name__ == "__main__":
    main()
