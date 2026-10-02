#!/bin/sh
# Run a film script with the pipeline's pinned dependencies.
exec uv run --quiet --with skia-python --with numpy --with scipy --with uharfbuzz --with fonttools --with OpenEXR --with mido python "$@"
