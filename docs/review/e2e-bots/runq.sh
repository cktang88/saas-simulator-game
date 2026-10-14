#!/bin/sh
cd "$(dirname "$0")"
export SIM_ROOT="${SIM_ROOT:-$(cd ../../../public && pwd)}"; mkdir -p out
tr '\n' '\0' < jobs.txt | xargs -0 -P 4 -I{} sh -c '{}'
echo ALLDONE > out/DONE
