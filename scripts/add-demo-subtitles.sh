#!/bin/bash

set -e

INPUT="${1:?Usage: $0 <input.mp4> [output.mp4]}"
OUTPUT="${2:-${INPUT%.*}_with_subs.mp4}"

FONT="/System/Library/Fonts/SFNS.ttf"
BOX="box=1:boxcolor=white@0.85:boxborderw=12"

ffmpeg -y -i "$INPUT" -vf "\
scale=-2:1080,\
drawtext=text='First, connect your data source.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,0,6)',\
drawtext=text='Works with Postgres, MySQL, GitHub, Stripe, and more.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,6,11)',\
drawtext=text='Next, build an Agent.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,11,15)',\
drawtext=text='Copilot builds the Agent for you.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,15,17)',\
drawtext=text='Tools are written in JS and run in a secure sandbox.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,17,21)',\
drawtext=text='Review the changes. Deploy.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,21,25)',\
drawtext=text='Next, create a Trigger. This one runs daily at 9 AM.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,25,31)',\
drawtext=text='Set a prompt for the Trigger.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,31,35)',\
drawtext=text='Triggers also work with Webhooks and App events.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,35,42)',\
drawtext=text='Next morning, 9 AM...':fontfile=$FONT:fontsize=48:fontcolor=black:$BOX:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,42,44)',\
drawtext=text='Check your inbox.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,44,46)',\
drawtext=text='The report arrived.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,46,50)',\
drawtext=text='Ask follow-up questions.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,50,53)',\
drawtext=text='For important actions, the Agent asks you first.':fontfile=$FONT:fontsize=36:fontcolor=black:$BOX:x=(w-text_w)/2:y=h-100:enable='between(t,53,60)'\
" -c:a copy "$OUTPUT"

echo "Output: $OUTPUT"
