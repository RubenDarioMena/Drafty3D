# `bpy==5.3.0` headless feasibility — research findings

Ticket: [#5 "Confirm bpy==5.3.0 works headless in this environment"](https://github.com/RubenDarioMena/Drafty3D/issues/5)
(part of the Drafty3D Learn map, [#3](https://github.com/RubenDarioMena/Drafty3D/issues/3))

Environment: cloud Linux container, Ubuntu 24.04.5 LTS, x86_64, Python 3.13.18
(`/usr/local/bin/python3`), no GPU/display attached. All commands below were
actually run in that environment; output is pasted verbatim (trimmed where noted).

Scripts in this folder are runnable evidence, not just assertions:

- `01_mesh_modifiers.py` — point 2 (mesh + modifiers + depsgraph evaluation)
- `02_gltf_export_draco.py` — point 3 (glTF/Draco export)
- `03_render_png.py` — point 4 (headless render to PNG)
- `out_render_blender_eevee.png`, `out_render_cycles_cpu.png` — actual render output, committed as evidence
- `out_cup_draco.glb` / `out_cup_plain.glb` are **not** committed (gitignored, ~424 KB
  each, byte-identical — see point 3 below for why)

To reproduce: `python3 -m venv .venv && .venv/bin/pip install bpy==5.3.0`, then run
each script with `.venv/bin/python <script>.py`.

---

## Point 1 — Does `pip install bpy==5.3.0` succeed?

**Verdict: YES, confirmed.**

First checked PyPI metadata (no guessing) for the Python version constraint:

```
$ pip index versions bpy
bpy (5.3.0)
Available versions: 5.3.0, 5.2.5, 5.2.4, 5.2.3, 5.2.2, 5.2.1, 5.2.0, 5.1.2, 5.1.1, 5.1.0
```

```
$ python3 -c "...pypi.org/pypi/bpy/5.3.0/json..."
requires_python: ==3.13.*
bpy-5.3.0-cp313-cp313-macosx_13_0_arm64.whl | ==3.13.*
bpy-5.3.0-cp313-cp313-manylinux_2_28_x86_64.whl | ==3.13.*
bpy-5.3.0-cp313-cp313-win_amd64.whl | ==3.13.*
bpy-5.3.0-cp313-cp313-win_arm64.whl | ==3.13.*
```

`bpy==5.3.0` requires **exactly** CPython 3.13.x (`cp313` wheels only, no sdist, no
3.12/3.14 wheel). This environment's `python3` is 3.13.18 — an exact match — and the
platform is x86_64 Linux, matching the `manylinux_2_28_x86_64` wheel. This is a hard
requirement a later pipeline step must respect: pinning or auto-selecting any other
Python minor version will make `pip install bpy==5.3.0` fail with no matching
distribution.

Actual install, in a clean venv:

```
$ python3 -m venv .venv && .venv/bin/python -m pip install bpy==5.3.0
Collecting bpy==5.3.0
  Downloading bpy-5.3.0-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (2.0 kB)
...
Downloading bpy-5.3.0-cp313-cp313-manylinux_2_28_x86_64.whl (427.5 MB)
   |====================================| 427.5/427.5 MB 101.8 MB/s  0:00:03
...
Successfully installed attrs-26.1.0 bpy-5.3.0 cattrs-26.2.1 certifi-2026.11.20
charset_normalizer-3.5.3 cython-3.3.2 idna-3.20 numpy-2.5.5 requests-2.34.2
typing-extensions-4.16.0 urllib3-2.8.0 zstandard-0.25.0

real	0m11.631s
```

```
$ .venv/bin/python -c "import bpy; print(bpy.app.version_string)"
bpy version: (5, 3, 0) 5.3.0
```

Reachability through this environment's network/proxy to PyPI is fine (427.5 MB wheel
downloaded in ~3s at >100MB/s through the proxy); no credential or extra network
allowlisting was needed. Installed package footprint is large: the `bpy` package alone
is **919 MB** on disk, so plan container/image size accordingly.

---

## Point 2 — Build a mesh, apply Subdivision Surface / Solidify / Bevel, evaluate headless

**Verdict: YES, confirmed, no crash, no display/GPU needed.**

`research/bpy-feasibility/01_mesh_modifiers.py` builds a cube with `bpy.ops`, adds the
three modifiers via `object.modifiers.new(name=..., type=...)` (`SOLIDIFY`, `BEVEL`,
`SUBSURF`), then evaluates through a depsgraph (`evaluated_depsgraph_get()` +
`object.evaluated_get(depsgraph)` + `.to_mesh()`), which is exactly the pattern a
content pipeline would use to get the final baked geometry.

Actual run:

```
$ .venv/bin/python 01_mesh_modifiers.py
Created object: LowPolyCup type: MESH
Base mesh verts/edges/polys: 8 12 6
Added modifier: Solidify SOLIDIFY
Added modifier: Bevel BEVEL
Added modifier: Subdivision SUBSURF
Modifier stack order: ['Solidify', 'Bevel', 'Subdivision']
Evaluated mesh verts: 3076
Evaluated mesh edges: 6144
Evaluated mesh polys: 3072
RESULT: OK - cube built, Solidify+Bevel+Subsurf applied and evaluated headless with no crash.
```

The evaluated mesh (3076 verts) is correctly denser than the base cube (8 verts),
confirming the modifier stack actually ran (not a no-op). No GPU/EGL/display was
touched for this step — pure CPU geometry evaluation.

---

## Point 3 — Export per-step to glTF with Draco compression from the same session

**Verdict: PARTIAL — glTF export works; Draco compression does NOT work out of the box.**

`io_scene_gltf2` (the glTF 2.0 I/O addon) ships bundled inside the `bpy` pip wheel and
is already registered; `bpy.ops.preferences.addon_enable(module="io_scene_gltf2")`
also succeeds explicitly, and `bpy.ops.export_scene.gltf(...)` exists and runs:

```
$ .venv/bin/python 02_gltf_export_draco.py
addon_enable(io_scene_gltf2) succeeded
io_scene_gltf2 in addons after enable: True
export_scene.gltf operator available: True
ERROR Draco is not available because library could not be found at
  .../site-packages/bpy/lib/libbf_intern_draco_bridge.so
ERROR MeshOptimizer is not available because library could not be found at
  .../site-packages/bpy/lib/libbf_intern_meshopt_bridge.so
...
Plain GLB export result: {'FINISHED'}
Plain GLB exists: True size: 431112
...
Draco GLB export result: {'FINISHED'}
Draco GLB exists: True size: 431112
Plain size: 431112 bytes, Draco size: 431112 bytes, ratio: 1.000
```

Root cause (traced into the addon source,
`io_scene_gltf2/io/exp/draco.py` -> `io_scene_gltf2/io/com/library.py`): the exporter's
Draco/MeshOptimizer compression calls into a native "bridge" shared library
(`libbf_intern_draco_bridge.so` / `libbf_intern_meshopt_bridge.so`) that a full
Blender install ships beside its Python, but **the pip `bpy` wheel does not include
these bridge libraries**. The wheel does ship `libdraco.so.9` and
`libmeshoptimizer.so` (the raw codec libraries, used internally elsewhere, e.g. USD),
but not Blender's own bridge wrapper that the glTF exporter's compression option
specifically calls into.

Practical effect: `export_draco_mesh_compression_enable=True` does not error and does
not fail the operator (`{'FINISHED'}` is still returned) — it just **silently falls
back to uncompressed export**, producing a byte-identical file to the non-Draco
export. A pipeline that blindly trusts the `{'FINISHED'}` result and checks "did a
.glb get written" would wrongly conclude Draco compression is working, when every
exported step is actually full-size. This is a real correctness trap for the planned
per-step export pipeline, not just a performance nice-to-have — if later tooling
assumes a given compression ratio or Draco-decodable extension in the glTF, it will
be silently wrong.

**No workaround found within the "no Blender GUI install" constraint.** Getting real
Draco compression would require either (a) shipping/copying the two bridge `.so`
files from a full Blender release into `bpy`'s `lib/` directory (untested here, and
arguably no longer "headless pip-only"), or (b) doing Draco compression as a
post-process outside bpy (e.g. the standalone `gltf-transform`/`draco_encoder` CLI,
or the `pygltflib` + `DracoPy` route) after plain glTF export. This should be flagged
to whoever is designing the per-step export pipeline.

---

## Point 4 — Headless single-frame render to PNG (Eevee, or CPU Cycles fallback)

**Verdict: YES, both Eevee and Cycles(CPU) work — but only after adding a missing
system library (`libegl1`) that is not present by default in this environment.**

First attempt (default environment, no extra packages installed) **aborted the whole
Python process** (not a catchable Python exception):

```
$ .venv/bin/python 03_render_png.py
...
00:00.428  gpu.vulkan       | WARNING Unable to initialize a Vulkan 1.1 instance.
Couldn't open libEGL.so.1: libEGL.so.1: cannot open shared object file: No such file or directory
$ echo $?
134   # SIGABRT
```

`mesa` itself (`libgl1-mesa-dri`, `libglx-mesa0`) was already present, but `libegl1`
(the EGL loader Blender's GPU backend uses to create an off-screen context for both
Eevee *and* Cycles' viewport/compile step) was missing. Installed it:

```
$ sudo apt-get install -y libegl1 libgl1
...
Setting up libegl-mesa0:amd64 (25.2.8-0ubuntu0.24.04.5) ...
Setting up libegl1:amd64 (1.7.0-1build1) ...
```

(apt was reachable without any extra network allowlisting — this is a one-line
addition for a container setup script.)

After that, both engines rendered successfully:

```
$ .venv/bin/python 03_render_png.py
Setting engine to BLENDER_EEVEE_NEXT raised: TypeError('... enum "BLENDER_EEVEE_NEXT"
  not found in (\'BLENDER_EEVEE\', \'BLENDER_WORKBENCH\', \'CYCLES\')')
00:00.374  gpu.vulkan       | WARNING Unable to initialize a Vulkan 1.1 instance.
EGL Error (0x3009): EGL_BAD_MATCH: ... (x3, non-fatal)
00:46.249  render           | Saved: '.../out_render_blender_eevee.png'
Engine=BLENDER_EEVEE -> wrote .../out_render_blender_eevee.png: exists=True size=53900
00:48.259  render           | Saved: '.../out_render_cycles_cpu.png'
Engine=CYCLES -> wrote .../out_render_cycles_cpu.png: exists=True size=55131

=== Summary ===
BLENDER_EEVEE_NEXT: FAILED (enum not found)
BLENDER_EEVEE: OK
CYCLES_CPU: OK
RESULT: OK - at least one render engine produced a PNG headless.
```

Notes:
- The render-engine enum identifier in Blender 5.3 is still `'BLENDER_EEVEE'` (not
  `'BLENDER_EEVEE_NEXT'` as the ticket guessed) — useful naming detail for pipeline code.
- Both PNGs are real renders (a shaded, lit red cube, not blank/black frames); both
  committed in this folder as evidence.
- First Eevee render took ~46s wall time (shader/pipeline warm-up, Vulkan probe
  failing then falling back to EGL/llvmpipe software rendering); Cycles (CPU, device
  forced via `scene.cycles.device = 'CPU'` and `compute_device_type = 'NONE'`) took
  ~2s once the process was warm. A real pipeline should expect a one-time warm-up
  cost per fresh process, not per frame.
- Cycles rendering, even forced to CPU, still goes through the same EGL/GPU-context
  code path at startup (hence the EGL errors appearing before the Cycles render
  too) — so the `libegl1` fix is required for **either** engine in this environment,
  not just Eevee.

---

## Summary table

| # | Question | Verdict |
|---|---|---|
| 1 | `pip install bpy==5.3.0` installs & imports | **Yes.** Needs exact CPython 3.13.x + x86_64/arm64 manylinux_2_28 or macOS/Windows wheel; this environment (3.13.18, x86_64) matches exactly. ~920 MB installed, ~430 MB download. |
| 2 | Build mesh, apply Subsurf/Solidify/Bevel, evaluate headless | **Yes.** Works via `bpy.ops` + `modifiers.new()` + depsgraph `evaluated_get()`, no GPU needed. |
| 3 | Export each step to glTF with Draco from the same session | **Partial / blocked.** Plain glTF/GLB export works fully. Draco (and MeshOptimizer) compression silently no-ops — the required native bridge library is missing from the pip wheel — so exported files are uncompressed despite `{'FINISHED'}` status. Needs a decision: ship the bridge .so some other way, or do Draco compression as a separate post-process step outside bpy. |
| 4 | Headless render to PNG (Eevee or CPU Cycles) | **Yes, with one environment fix.** Requires installing `libegl1` (not present by default) alongside the already-present mesa libs; without it the process hard-aborts (SIGABRT), not a Python-catchable error. Once added, both `BLENDER_EEVEE` and `CYCLES` (CPU-forced) render real, valid PNGs headless. |

## Action items for the wayfinder map

1. Pin the content-pipeline's Python to 3.13.x to match `bpy==5.3.0`'s wheel constraint.
2. Add `libegl1` (and keep `libgl1-mesa-dri`/`libglx-mesa0`) to whatever container
   setup script builds the render worker image; otherwise headless rendering
   SIGABRTs on first use.
3. Decide how Draco compression will actually happen for the per-step glTF export —
   it cannot be done via `bpy.ops.export_scene.gltf(..., export_draco_mesh_compression_enable=True)`
   in the pip-only `bpy` package as shipped. This blocks the "export per-step to glTF
   with Draco" part of the pipeline as currently scoped and needs a follow-up decision
   (external compressor CLI, or accept uncompressed glTF for now).
4. Use `'BLENDER_EEVEE'` as the render engine identifier for Blender 5.3's `bpy`, not
   `'BLENDER_EEVEE_NEXT'`.
