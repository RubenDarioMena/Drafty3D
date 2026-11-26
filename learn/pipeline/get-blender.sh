#!/usr/bin/env bash
# Downloads the full Blender 5.3.0 app (not the bpy wheel) for recording sculpt strokes.
# Sculpting needs Blender's windowed event loop; the recorder runs it on a virtual X display.
set -euo pipefail
cd "$(dirname "$0")"
version=5.3.0
name="blender-$version-linux-x64"
[ -x ".blender/$name/blender" ] && { echo "Blender $version ya está en learn/pipeline/.blender"; exit 0; }
mkdir -p .blender && cd .blender
base="https://download.blender.org/release/Blender${version%.*}"
curl -fL --retry 4 -C - -O "$base/$name.tar.xz"
curl -fL --retry 4 -o "blender-$version.sha256" "$base/blender-$version.sha256"
grep " $name.tar.xz\$" "blender-$version.sha256" | sha256sum -c -
tar -xf "$name.tar.xz" && rm "$name.tar.xz"
echo "Listo: learn/pipeline/.blender/$name/blender"
