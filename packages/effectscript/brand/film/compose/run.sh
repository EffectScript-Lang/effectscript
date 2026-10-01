#!/bin/sh
# Run a compositor command with its pinned dependencies.
exec uv run --quiet --with skia-python --with numpy --with uharfbuzz --with fonttools --with OpenEXR python "$(dirname "$0")/render.py" "$@"
