#!/bin/sh
# 把 samples/ 里的样例图做成 Chromium 假摄像头用的 y4m 视频（640×480、10fps、每张 4 秒、轻微左右摆动模拟转头）。
# 用法：sh tests/face-login/make_videos.sh <输出目录>（需要 ffmpeg；y4m 文件较大，不入库）
set -e
OUT=${1:-/tmp/face_media}
S=$(cd "$(dirname "$0")/samples" && pwd)
mkdir -p "$OUT"
# 每张图：文件名 裁剪宽 裁剪高 x y（以人脸为中心、4:3）
CROPS='person-vlado.jpg 708 531 245 0
person-vlado1.jpg 261 196 348 41
person-vlado5.jpg 316 237 311 6
ai-face.jpg 256 192 0 32
person-lexi.jpg 1024 768 0 0
person-celeste.jpg 468 351 441 52'
mk() {
  out=$1; shift; i=0; inputs=""; parts=""; cc=""
  for img in "$@"; do
    set -- $(echo "$CROPS" | grep "^$img ")
    inputs="$inputs -loop 1 -t 4 -i $S/$1"
    parts="$parts[$i:v]crop=$2:$3:$4:$5,scale=640:480,setsar=1,fps=10,rotate='0.07*sin(2*PI*t/2)':fillcolor=0x707070,format=yuv420p[v$i];"
    cc="$cc[v$i]"; i=$((i+1))
  done
  ffmpeg -y -loglevel error $inputs -filter_complex "${parts}${cc}concat=n=$i:v=1:a=0[o]" -map "[o]" -pix_fmt yuv420p "$OUT/$out.y4m"
  echo "$OUT/$out.y4m"
}
mk personA person-vlado.jpg person-vlado1.jpg person-vlado5.jpg
mk personB ai-face.jpg
mk stranger person-lexi.jpg person-celeste.jpg
