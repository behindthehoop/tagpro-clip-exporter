# TagPro Replay Clip Exporter

A Tampermonkey userscript for exporting clips from [TagPro](https://tagpro.koalabeast.com/) replays as MP4 or WebM video files.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser
2. [Click here to install the script](https://raw.githubusercontent.com/FLYMOLO/tagpro-clip-exporter/main/tagpro-clip-exporter.user.js)

## Features

- **Auto-detect flag captures** — parses the replay data to find every cap and auto-fills clip times + POV player
- **POV and Whole Map** camera modes
- **MP4 output** (WebM fallback for Firefox)
- **Resolution:** Native, 720p, 1080p
- **Bitrate:** 8, 12, 20 Mbps
- **Hotkey:** press `/` to grab the current clock time

## Usage

Open any replay URL, expand "Auto-detect flag captures" and click Find Caps, select a cap, and hit Export. Or enter times manually.

Set replay speed to 1× before exporting.

## Credits

Built by FLYMOLO with Claude. Replay parsing approach from [anom's tp-replay-to-video](https://gitlab.com/anom/tp-replay-to-video).

## License

MIT
