#!/bin/sh
# Calibration grid: path × model × policy, seeds split in chunks, 4 parallel processes.
# Usage: ./run.sh [seedsPerCell=40] [days=1095] [chunk=10] [models="b2c smb"] [paths="indie vc"]
cd "$(dirname "$0")"
export SIM_ROOT="${SIM_ROOT:-$(cd ../../../public && pwd)}"
N=${1:-40}; DAYS=${2:-1095}; CH=${3:-10}; MODELS=${4:-"b2c smb"}; PATHS=${5:-"indie vc"}
mkdir -p out; rm -f out/jobs.txt
for p in $PATHS; do for m in $MODELS; do for pol in elite average mistakes; do
  s=1; while [ $s -le $N ]; do e=$((s+CH-1)); [ $e -gt $N ] && e=$N
    echo "node run-cell.mjs $p $m $pol $s $e $DAYS > out/$p-$m-$pol-$s.json 2> out/$p-$m-$pol-$s.log" >> out/jobs.txt
    s=$((e+1)); done; done; done; done
tr '\n' '\0' < out/jobs.txt | xargs -0 -P 4 -I{} sh -c '{}'
echo ALLDONE > out/DONE
