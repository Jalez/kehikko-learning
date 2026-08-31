#!/usr/bin/env bash
#
# The one name every module ships this under, so a host that offers to start one
# has a script to run rather than a command line to build.
#
#   - No arguments. A registration names a directory and one script inside it,
#     never a command line: a string a host handed to a shell would make a
#     registration file a place to write shell.
#   - $PORT from the environment. Whoever starts this chose the port; a script
#     that picked its own would answer somewhere nobody is looking. 7950 is the
#     default and it is the number in the registration too — 7820, 7840, 7850,
#     7860, 7870, 7890, 7900, 7910, 7920, 7930 and 7940 belong to the other
#     modules on this machine, and 4180/4181 to the host.
#   - `exec`, and the foreground. A script that forks and returns leaves whoever
#     started it holding a pid that stops nothing, and Stop is only ever offered
#     for what a host started.
#   - `cd` to this script's own directory, so `node_modules` and the Vite config
#     are found however the script was invoked. It no longer has anything to do
#     with where the store is: the questions are not here any more. Each project
#     keeps its own in `<project>/.kehikot/learning/questions.json`, which is the folder
#     the host names in `roadmap.context`.
#
# It does NOT register. Registration is a deliberate act by a person — see
# `register.ts` — and a start script that quietly wrote into somebody's home
# directory would be doing it on their behalf.
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

exec bunx vite --host 127.0.0.1 --port "${PORT:-7950}" --strictPort
