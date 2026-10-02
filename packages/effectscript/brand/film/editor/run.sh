#!/bin/sh
# Start the timeline editor on http://localhost:4747
exec uv run --quiet --with skia-python --with numpy --with scipy --with uharfbuzz --with fonttools --with OpenEXR --with mido python "$(dirname "$0")/server.py"
