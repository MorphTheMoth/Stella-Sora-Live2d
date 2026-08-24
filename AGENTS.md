# AGENTS.md

Do not edit `README.md`. Keep it as-is; it only contains the project title.

All project documentation lives in `AgentsReadme.md` — edit that file instead.

This is a datamine project first and foremost, do not extract data temporarily, always make scripts that will be executed again once the game updates.

Never hand-edit generated/dumped artifacts (`data/*.json`, extracted assets under `chars/`, anything under `.dump_tmp/`); they are overwritten by the next `scripts/dump.sh` run. When generated output looks wrong, fix the generating script (`extract*.mjs`, `generate*.mjs`, `normalize.py`, ...) and re-run it, so the fix survives game updates. When fixing issues only some entries have, and you're using a temporary script to diagnose the issues, make sure to mirror the edits on the real script, it must never be out of date.


Other datamine projects:

`/home/morph/stella sora meter/StellaSoraData Makostar`:
- A datamine of the game UI in /_Lua
`/home/morph/ssassets`:
- A datamine of the game assets
`/home/morph/stella sora meter/dll/Stella-Sora-Combat-Logger/decompilation/decompiled.c`:
- Decompilation of GameAssembly.dll
`/home/morph/stella sora meter/dll/Stella-Sora-Combat-Logger/decompilation/out_new`:
- Il2Cpp dumps

`/home/morph/stella sora meter/Link to YostarGames/StellaSora_EN`:
- The actual game files
