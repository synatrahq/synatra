#!/bin/bash

set -e

INPUT="${1:?Usage: $0 <input.mp4> [output.mp4]}"
OUTPUT="${2:-${INPUT%.*}_with_subs.mp4}"

FONT="/System/Library/Fonts/SFNS.ttf"
BOX="box=1:boxcolor=black@0.85:boxborderw=12"

ffmpeg -y -i "$INPUT" -vf "\
scale=-2:1080,\
drawtext=text='First, connect your data source.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-60:enable='between(t,0,6)',\
drawtext=text='Works with Postgres, MySQL, GitHub, Stripe, and more.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-60:enable='between(t,6,11)',\
drawtext=text='Next, build an Agent. Copilot writes the code.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-60:enable='between(t,11,18)',\
drawtext=text='Review the changes. Deploy.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-60:enable='between(t,18,26)',\
drawtext=text='Next, create a Trigger. This one runs daily at 9 AM.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-60:enable='between(t,26,33)',\
drawtext=text='Set a prompt for the Trigger.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-60:enable='between(t,33,41)',\
drawtext=text='Triggers also work with Webhooks and Events.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-60:enable='between(t,41,46)',\
drawtext=text='Next morning, 9 AM...':fontfile=$FONT:fontsize=48:fontcolor=white:$BOX:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,46,49)',\
drawtext=text='Check your inbox.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-60:enable='between(t,49,52)',\
drawtext=text='The report arrived.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-60:enable='between(t,52,55)',\
drawtext=text='Ask the Agent for more.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-60:enable='between(t,55,60)',\
drawtext=text='For important actions, the Agent asks you first.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-60:enable='between(t,60,67)'\
" -c:a copy "$OUTPUT"

echo "Output: $OUTPUT"
