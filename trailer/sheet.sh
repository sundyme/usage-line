#!/bin/sh
# usage: sheet.sh out.png cols t1,t2,...   (renders stills, tiles them)
OUTF=$1; COLS=$2; TIMES=$3
rm -rf out/stills && node render.mjs --still "$TIMES" 2>&1 | grep -v Truncating | grep -E "error|Error" ; cd out/stills && ls *.png | sort -n | sed "s/^/file '/;s/$/'/" > list.txt && N=$(wc -l < list.txt) && ROWS=$(( (N + COLS - 1) / COLS )) && ffmpeg -hide_banner -loglevel error -y -f concat -i list.txt -vf "scale=960:540,tile=${COLS}x${ROWS}:padding=6:color=white" -frames:v 1 "../$OUTF"
