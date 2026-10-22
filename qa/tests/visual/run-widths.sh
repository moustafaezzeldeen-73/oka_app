#!/bin/sh
# Runs v2-widths.mjs for every viewport, 6 at a time.
cd "$(dirname "$0")"
printf '%s\n' p320 p360 p375 p390 p412 p430 l667 l844 l932 t768 t820 tl1024 tl1180 d1024 d1280 d1440 d1920 | xargs -P 6 -I{} sh -c 'node v2-widths.mjs {} > out/widths-{}.log 2>&1'
