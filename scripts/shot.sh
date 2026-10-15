#!/bin/zsh
# shot.sh <name> <w> <h> <path> [js to run first] — screenshot the dev app to a fresh file.
# Clicks are by visible text: use click("Garage") in the JS.
name=$1; w=$2; h=$3; url="http://localhost:5190$4"; pre=$5
helpers='window.click=(t)=>{const b=[...document.querySelectorAll("button,[role=tab],a")].find(x=>x.textContent.trim().toLowerCase().startsWith(t.toLowerCase()));if(b){b.click();return true}return false};window.wait=(ms)=>new Promise(r=>setTimeout(r,ms));'
skip='localStorage.clear();'
out=/tmp/claude-shots/${name}-$(date +%s).png
GL=1 SETTLE_MS=${SETTLE:-5000} PRE="$helpers (async()=>{ click('Look around'); await wait(400); $pre })()" PRE_SETTLE_MS=${PRESETTLE:-2500} SHOT=$out node ~/.claude/skills/build/scripts/probe.mjs "$url" "${EXPR:-\"ok\"}" $w $h 2>&1 | tail -1
echo $out
