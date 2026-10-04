"""Web derivatives of the landing page's key visuals (`key-visuals/site/*.jpg`, the 3840x2160
masters) and the launch film's stills for effectscript.dev: WebP at 1280 and 2560 pixels wide,
written to `web/lp/`. The site's content script copies them into `public/img/lp/`."""

from PIL import Image

import brand as b

SRC = b.ROOT / "key-visuals/site"
FILM = b.ROOT / "film/images/select"
# the film's own stills, for its room on the page
FILM_STILLS = ("monolith-plain", "paper-avalanche", "threads-hall", "one-thread", "dawn")
OUT = b.ROOT / "web/lp"
WIDTHS = (1280, 2560)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    masters = [(m, m.stem) for m in sorted(SRC.glob("*.jpg"))]
    masters += [(FILM / f"{still}.jpg", f"film-{still}") for still in FILM_STILLS]
    for master, name in masters:
        image = Image.open(master).convert("RGB")
        for width in WIDTHS:
            height = round(image.height * width / image.width)
            image.resize((width, height), Image.LANCZOS).save(
                OUT / f"{name}-{width}.webp", "WEBP", quality=80 if width > 1280 else 78, method=6
            )
        print(name)


if __name__ == "__main__":
    main()
