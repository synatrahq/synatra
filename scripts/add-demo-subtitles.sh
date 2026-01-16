#!/bin/bash

set -e

INPUT="${1:?Usage: $0 <input.mp4> [output.mp4]}"
OUTPUT="${2:-${INPUT%.*}_with_subs.mp4}"

FONT="/System/Library/Fonts/SFNS.ttf"
BOX="box=1:boxcolor=black@0.6:boxborderw=12"

ffmpeg -y -i "$INPUT" -vf "\
drawtext=text='First, connect your data source.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-80:enable='between(t,0,4)',\
drawtext=text='Supports PostgreSQL, MySQL, GitHub, Stripe, REST API and more.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-80:enable='between(t,4,10)',\
drawtext=text='Next, build the Agent.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-80:enable='between(t,11,15)',\
drawtext=text='Copilot builds it for you.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-80:enable='between(t,16,19)',\
drawtext=text='Review the changes and deploy your Agent.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-80:enable='between(t,20,29)',\
drawtext=text='Next, create a Trigger. This one reports tasks daily at 9 AM.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-80:enable='between(t,30,36)',\
drawtext=text='Triggers also support Webhooks and App events.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-80:enable='between(t,37,46)',\
drawtext=text='Next morning, 9 AM...':fontfile=$FONT:fontsize=48:fontcolor=white:$BOX:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,47,49)',\
drawtext=text='Let'\''s check the Inbox.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-80:enable='between(t,49,50)',\
drawtext=text='The report has arrived.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-80:enable='between(t,50,53)',\
drawtext=text='You can also request additional tasks from the AI.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-80:enable='between(t,53,57)',\
drawtext=text='For important actions, AI requests your approval.':fontfile=$FONT:fontsize=36:fontcolor=white:$BOX:x=(w-text_w)/2:y=h-80:enable='between(t,58,64)'\
" -c:a copy "$OUTPUT"

echo "Output: $OUTPUT"
