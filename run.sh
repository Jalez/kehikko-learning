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
#   - `cd` to this script's own directory, so this app's store is beside the
#     program however it was invoked. That is not a detail here: `data/` holds
#     every question anybody wrote and every answer anybody gave, and the whole
#     claim of the module is that the directory can be copied to another machine
#     and run.
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

# Said out loud rather than left to a default, and the reason is in `store.ts`:
# Vite bundles its own config into `node_modules/.vite-temp/`, so anything in
# that graph asking where it lives gets the wrong answer — or, under Node,
# `undefined`. Naming the directory here is the one place that cannot be moved by
# a bundler, and it is `$PWD` because of the `cd` above, so the store is beside
# this script however the script was invoked. Somebody who has already set the
# variable keeps their own answer.
export LEARNING_DATA="${LEARNING_DATA:-$PWD/data}"

if [ ! -d node_modules ]; then
  echo "installing…" >&2
  bun install >&2
fi

exec bunx vite --host 127.0.0.1 --port "${PORT:-7950}" --strictPort
