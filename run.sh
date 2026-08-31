#!/usr/bin/env bash
#
# The one name every module ships this under, so a host that offers to start one
# has a script to run rather than a command line to build.
#
#   - No arguments. A registration names a directory and one script inside it,
#     never a command line: a string a host handed to a shell would make a
#     registration file a place to write shell.
#   - No port on the `vite` line, and no `--strictPort`. Both used to be there,
#     with 7950 written here and again in `register.ts` — 7820 through 7960
#     belong to the other modules on this machine and 4180/4181 to the host, so
#     moving this one meant two edits and then remembering that the file in
#     `~/.roadmap/modules` still named the old address. It is said once now,
#     beside the id, as `PREFERRED_PORT` in `manifest.ts`.
#
#     $PORT is still honoured — by `serves()` in `vite.config.ts` rather than by
#     this line — and for the reason this bullet always gave: whoever starts this
#     chose the port, and an app that picked its own would answer somewhere
#     nobody is looking. A host passes the port from the registration when it
#     spawns this script, which is the address it is about to go and read.
#
#     What `--strictPort` bought was an app that DIED on a taken port rather than
#     one answering quietly somewhere else, and that was the only honest option
#     while nothing handled a collision. `serves()` handles it: a free 7950 is
#     taken in silence, this module already answering there ends the start
#     cleanly instead of making a second copy, and anything else is a loud move
#     with the registration rewritten to the port actually bound.
#   - `exec`, and the foreground. A script that forks and returns leaves whoever
#     started it holding a pid that stops nothing, and Stop is only ever offered
#     for what a host started.
#   - `cd` to this script's own directory, so `node_modules` and the Vite config
#     are found however the script was invoked. It no longer has anything to do
#     with where the store is: the questions are not here any more. Each project
#     keeps its own in `<project>/.kehikot/learning/questions.json`, which is the folder
#     the host names in `roadmap.context`.
#
# It does NOT register a module that had none. Registration is a deliberate act
# by a person — see `register.ts` — and a start script that quietly wrote into
# somebody's home directory would be doing it on their behalf. That argument is
# untouched. What the Vite plugin writes on every start is this module's ADDRESS,
# which is a different sentence: the person decided to be framed, they did not
# decide to be framed at 7950 in particular, and a registration still naming a
# port this app has drifted off is one the host sweeps to find nothing.
#
# ## There is no build here, no `dist`, and no `build` script in package.json
#
# The argument for building and serving off disk is that starting should be
# starting — a start that shells out to a build is a start that fails when the
# network is down. The argument is fine and the shape is still wrong, because
# this program is not deployed: it runs on the machine of the person editing it.
# What `dist` actually buys is a STALE page served with a 200, every symptom of a
# working app and none of the changes, and that failure has cost this workspace
# whole afternoons in three separate programs. A missing build announces itself.
# A stale one does not.
#
# Several modules here still carry a `"build": "vite build"` that cannot succeed,
# because there is no `index.html` for Vite to start from — the page is generated
# per request, see `page/document.ts`. This one deliberately ships neither.
#
# So Vite serves the page. The manifest, the health check, the MCP door and this
# app's own store are middleware in front of the same server — see `doors()` in
# `vite.config.ts` — because a module is one origin or it is nothing, and because
# a page that fetched its own questions from a second port would be fetching them
# cross-origin, which is to say not at all.
set -euo pipefail
cd "$(dirname "$0")"

# `LEARNING_DATA` used to be exported here, naming the directory the store lived
# in, because Vite bundles its own config into `node_modules/.vite-temp/` and
# anything in that graph asking where it lives gets the wrong answer — or, under
# Node, `undefined`. Saying it in the launch script was the one place a bundler
# could not move.
#
# There is nothing left for it to name. The questions are inside the projects
# they are about, at `<project>/.kehikot/learning/questions.json`, and the project is a
# path the HOST supplies per canvas in `roadmap.context` — one process now serves
# whichever project is open rather than one directory it was pointed at. A
# variable that still moved "the store" would be a second answer to a question
# the host already answers, and the two would disagree the first time somebody
# switched project.

if [ ! -d node_modules ]; then
  echo "installing…" >&2
  bun install >&2
fi

exec bunx vite
