# Draco glTF compression workaround — findings (ticket #11)

Follows on from [#5](https://github.com/RubenDarioMena/Drafty3D/issues/5): `pip install bpy==5.3.0`'s
glTF exporter silently no-ops Draco (`export_draco_mesh_compression_enable=True` reports
`{'FINISHED'}` but writes a byte-identical uncompressed file, because the wheel ships the raw
`libdraco`/`libmeshoptimizer` codec libs but not Blender's native C++ bridge that the exporter
calls into).

All three options in the ticket were actually run, not just read about. Scripts are in this
directory (`export_cup_steps.py`, `python_draco_poc.py`); exact commands below. Generated `.glb`
output files are not committed (they're a few MB and fully reproducible by re-running the
scripts) — the tables below give the exact byte counts measured.

## Test fixture: a real low-poly "cup" export, step by step

`export_cup_steps.py` builds a cube and exports it to plain (uncompressed) GLB after each
modifier change, using `bpy==5.3.0`, mirroring what the real per-step pipeline will do:

```
python3 export_cup_steps.py out/
```

Modifier order used: **Bevel → Solidify → Subdivision Surface** (not Subdivision → Solidify →
Bevel). Tried Subdivision-then-Bevel first: once Subdivision Surface has smoothed away the
cube's sharp 90° edges, Bevel's default angle-limited mode (`limit_method='ANGLE'`, 30°) finds
nothing left to bevel (file size didn't change at all — a real and non-obvious trap for anyone
scripting this). Setting `limit_method='NONE'` to force it to bevel anyway beveled *every* edge
of an already-dense subdivided mesh and blew the vertex count up combinatorially (76,804 verts
on the final step, 11.4 MB uncompressed) — not representative of a "few-thousand-vert" teaching
step. Bevel-before-Subdivision avoids both problems and stays in the range the ticket described.

| step | verts | plain GLB (bytes) |
|---|---|---|
| 01 base cube | 8 | 1,728 |
| 02 bevel (2 segments) | 56 | 8,460 |
| 03 bevel (4 segments) | 152 | 21,904 |
| 04 + solidify | 304 | 42,912 |
| 05 + subsurf level 1 | 1,204 | 169,020 |
| 06 + subsurf level 2 | 4,804 | 673,028 |
| 07 + subsurf level 3 (final polish) | 19,204 | 2,912,520 |
| **TOTAL, 7 steps** | | **3,829,572 (3.74 MB)** |

Real numbers, not a guess: a 7-step cup, plain uncompressed glTF, is **~3.7 MB total**, dominated
by the last subdivision step alone (2.9 MB, 78% of the total). Vertex/triangle count roughly
quadruples per subdivision level, so whichever step is "the polished final mesh" dominates file
size badly once Subdivision Surface is in the stack at level ≥2.

## Option 1 — Node-side post-process: `gltf-transform` CLI

```
npm install -g @gltf-transform/cli      # v4.5.1 installed cleanly
gltf-transform draco out/<step>.glb out-draco/<step>.glb
```

Ran this on all 7 real exported steps above. Verified it's real compression (not another silent
no-op) with `gltf-transform inspect`, which shows `extensionsUsed` / `extensionsRequired` =
`KHR_draco_mesh_compression` on the output.

| step | plain (bytes) | draco (bytes) | reduction |
|---|---|---|---|
| 01 base cube | 1,728 | 1,048 | 39.4% |
| 02 bevel seg2 | 8,460 | 1,484 | 82.5% |
| 03 bevel seg4 | 21,904 | 2,296 | 89.5% |
| 04 solidify | 42,912 | 3,656 | 91.5% |
| 05 subsurf lvl1 | 169,020 | 10,372 | 93.9% |
| 06 subsurf lvl2 | 673,028 | 27,660 | 95.9% |
| 07 subsurf lvl3 | 2,912,520 | 83,540 | 97.1% |
| **TOTAL** | **3,829,572** | **130,056** | **96.6%** |

`gltf-transform validate` on the compressed output: **"No errors found."** This works, cleanly,
on the exact files `bpy` actually produces, with no corruption and no manual buffer surgery —
`gltf-transform` understands `KHR_draco_mesh_compression` natively and handles attribute
splitting (split normals, UVs) correctly because it operates at the glTF-document level, not by
re-deriving topology from raw point/face arrays (see Option 2 for what goes wrong when you do
that).

Command used per file, one line, ~0.1–0.3s per file on these mesh sizes. A real pipeline would
run `gltf-transform draco <in> <out>` as a second CLI step right after `bpy`'s export call, or
call the JS API (`@gltf-transform/core` + `@gltf-transform/extensions`) in-process if the
pipeline is Node-orchestrated.

## Option 2 — Python-side post-process

**`draco3d` (the PyPI package named in the ticket) has no wheel for this environment at all** —
`pip install draco3d` fails outright (`Could not find a version that satisfies the requirement
draco3d (from versions: none)`), on Python 3.13 / this platform. It's not a viable option here.

Found and tried an alternative maintained PyPI package instead: **`DracoPy`** (a Cython wrapper
around the real Draco C++ codec, prebuilt wheel for `cp313-manylinux`, installed cleanly).
There is no maintained Python library that does the full "load glTF, Draco-compress it,
re-wire the extension" job in one call — `pygltflib` (the glTF reader/writer named in the
ticket) has zero Draco support (`KHR_draco_mesh_compression` isn't in it at all) — so this
requires exactly the "manual glTF buffer manipulation" the ticket flagged as a risk.

Built `python_draco_poc.py`: loads a plain GLB with `trimesh`, Draco-encodes the raw
points+faces with `DracoPy.encode_mesh_to_buffer`, then hand-builds a new GLB with `pygltflib`
(bufferView holding the Draco blob, accessors with no bufferView of their own, a
`KHR_draco_mesh_compression` primitive extension). Ran it on the real `04_solidify.glb` export
(1,200 non-indexed verts / 600 faces as glTF stores them — split-normal exports duplicate
verts per face corner):

```
python3 python_draco_poc.py out/04_solidify.glb out-python-draco/04_solidify.glb
```

Result: **1,816 bytes** written (vs. 42,912 bytes plain, vs. 3,656 bytes via `gltf-transform` on
the same file). That looks like an even better ratio — but it isn't a fair comparison:

- `DracoPy.encode_mesh_to_buffer()`'s API takes a flat point list + face list and welds
  vertices that share a position, the way Draco's point-cloud-style encoder naturally does.
- The glTF export had 1,200 verts for 304 unique positions (4x duplication) specifically to
  preserve **split/hard-edge normals** per face corner — a legitimate, intentional non-indexed
  layout.
- Round-tripping the hand-built file back through `DracoPy.decode()` confirms the mismatch
  directly: **304 verts came back, not 1,200.** The encode step silently discarded the
  per-corner normal split and rebuilt a smooth-shaded, topologically different mesh.
- This is exactly the class of bug the ticket #11 background warns about with the `bpy`
  exporter's silent no-op: an operation that "succeeds" (valid output file, even passes
  `gltf-transform validate` with **zero errors** once accessor `byteOffset` is set to `None`
  instead of pygltflib's default `0` — another non-obvious trap) while quietly corrupting mesh
  data.
- Doing this correctly would mean reimplementing Draco's per-corner attribute-ID handling
  (what Blender's own native bridge wrapper does under the hood) on top of `DracoPy`'s
  high-level `encode()`/`encode_mesh_to_buffer()` calls, which only expose a per-vertex
  (not per-corner) attribute model. `DracoPy` does accept a `generic_attributes` dict, but it's
  documented as aligned to vertices, not face corners, so it doesn't close this gap either
  without materially more encoder-level engineering.

So: a pure-Python path is possible in principle, genuinely compresses, and produces a file that
*passes the glTF validator* — but the straightforward way to do it silently damages geometry
fidelity for exactly the kind of hard-edge-normal meshes a Bevel/Solidify modifier stack
produces, in a way that would be easy to ship without noticing (just like the original bpy bug).

## Option 3 — do nothing, ship uncompressed

Real numbers from above: ~3.7 MB total for one 7-step cup example, with a single "final polish"
step able to reach several MB once Subdivision Surface is at a moderate level. For an *offline,
installable APK* (ticket #3's delivery target) bundling several worked examples (cup now, two
more modifier examples later per the map), uncompressed quickly adds multiple cup-sized examples
worth of megabytes to app size, and the biggest single file (2.9 MB for one step) is well into
"notice it on a slow connection / APK size" territory even before a second or third example is
added. The spec's "small by principle, no strict size limit" allowance covers this prototype, but
"do nothing" trades an ~97%-achievable size reduction for zero implementation cost — and compounds
with every future example added to the module.

## Recommendation

**Use Option 1: `gltf-transform` CLI (`@gltf-transform/cli`) as a post-process step after `bpy`'s
plain glTF/GLB export.**

Reasoning:
- It actually works, verified end-to-end on real pipeline output, with a 96.6% size reduction
  across the 7-step cup example (3.74 MB → 130 KB) and zero validator errors.
- It handles attribute splitting (normals, UVs) correctly because it operates on the glTF
  document model, not raw point/face arrays — avoiding the silent mesh-corruption risk found in
  Option 2.
- `draco3d` (Python) isn't installable here at all, and the realistic Python alternative
  (`DracoPy` + hand-built buffers) demonstrably needs non-trivial additional engineering to avoid
  corrupting split-normal geometry — a bad trade against a one-line, already-correct CLI command.
- The repo already has a Node/Vite toolchain (per the map, issue #3), so adding
  `@gltf-transform/cli` as a dev dependency / npx-invoked step is a natural fit, not a new
  ecosystem.
- Cost: the pipeline becomes a two-step process (bpy export → `gltf-transform draco` subprocess
  call per file) rather than a single `bpy` call. See note on ticket #7 below.

## Note for ticket #7 (pipeline ↔ UI contract, still open)

**Yes, #7 needs to account for a two-step export-then-compress pipeline**, not a single `bpy`
export call per step:
1. `bpy` exports plain glTF/GLB (Draco flag has no effect — see #5/#11).
2. A separate `gltf-transform draco <in> <out>` subprocess call (or the equivalent JS API call,
   if the pipeline driver ends up being Node rather than shelling out) Draco-compresses it.

Whatever owns "run the pipeline for step N" needs to shell out to (or otherwise invoke)
`gltf-transform` after each `bpy` export call, and the per-step output file ultimately served to
the UI is the *second* file, not bpy's direct export. Not edited directly — flagged here per the
ticket #11 instructions for the main session to fold into #7.

## Commands reference

```bash
pip install bpy==5.3.0
python3 export_cup_steps.py out/

npm install -g @gltf-transform/cli
gltf-transform draco out/<step>.glb out-draco/<step>.glb
gltf-transform validate out-draco/<step>.glb
gltf-transform inspect out-draco/<step>.glb   # confirms KHR_draco_mesh_compression present

pip install DracoPy pygltflib trimesh   # draco3d: no wheel for this Python/platform, fails outright
python3 python_draco_poc.py out/04_solidify.glb out-python-draco/04_solidify.glb
```
