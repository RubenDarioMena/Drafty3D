"""
Proof-of-concept for ticket #11 option 2: can a pure-Python, PyPI-only
toolchain (no Blender draco bridge) Draco-compress a glTF that bpy
exported, by manually building the KHR_draco_mesh_compression extension?

Pipeline:
  1. Load a plain glTF/GLB (as exported uncompressed by bpy) with trimesh.
  2. Pull out vertex positions + triangle indices (+normals if present).
  3. Encode them to a raw Draco mesh buffer with DracoPy
     (pip install DracoPy -- draco3d itself has NO wheel for this
     Python/platform combo, see note below).
  4. Hand-build a new .glb using pygltflib: one bufferView holding the
     Draco buffer, a primitive with a KHR_draco_mesh_compression
     extension pointing at it, and accessors that carry count/type/min/max
     but no bufferView of their own (per the extension spec, the real
     data lives only in the compressed buffer).
  5. Verify the result with `gltf-transform validate` / `inspect`
     (external, independent check) and by decoding it back with DracoPy.

Run: python3 python_draco_poc.py <input.glb> <output.glb>
"""
import sys
import struct

import numpy as np
import trimesh
import DracoPy
import pygltflib
from pygltflib import GLTF2, Buffer, BufferView, Accessor, Attributes


def main():
    in_path, out_path = sys.argv[1], sys.argv[2]

    mesh = trimesh.load(in_path, process=False, force="mesh")
    positions = np.asarray(mesh.vertices, dtype=np.float32)
    faces = np.asarray(mesh.faces, dtype=np.uint32)
    normals = np.asarray(mesh.vertex_normals, dtype=np.float32) if mesh.vertex_normals is not None else None

    print(f"input mesh: {len(positions)} verts, {len(faces)} faces")

    draco_bytes = DracoPy.encode_mesh_to_buffer(
        points=positions.flatten().tolist(),
        faces=faces.flatten().tolist(),
    )
    print(f"draco buffer: {len(draco_bytes)} bytes")

    # --- hand-build a minimal glTF container around the draco buffer ---
    gltf = GLTF2()
    gltf.asset.generator = "draco-python-poc (DracoPy + pygltflib, no bpy bridge)"

    # Pad the draco blob to a 4-byte boundary for GLB chunk alignment.
    pad = (-len(draco_bytes)) % 4
    draco_padded = draco_bytes + b"\x00" * pad

    buffer = Buffer(byteLength=len(draco_padded))
    gltf.buffers.append(buffer)

    buffer_view = BufferView(buffer=0, byteOffset=0, byteLength=len(draco_bytes))
    gltf.bufferViews.append(buffer_view)

    mins = positions.min(axis=0).tolist()
    maxs = positions.max(axis=0).tolist()
    # NOTE: accessors that live inside a KHR_draco_mesh_compression
    # primitive carry no bufferView (their data is only in the compressed
    # draco buffer) -- and byteOffset must then be left UNSET, not 0.
    # pygltflib's Accessor() defaults byteOffset to 0 and serializes it,
    # which the (still draco-unaware) official glTF validator flags as
    # "UNSATISFIED_DEPENDENCY: bufferView must be defined". Explicitly
    # clearing byteOffset to None works around that.
    pos_accessor = Accessor(
        componentType=pygltflib.FLOAT,
        count=len(positions),
        type=pygltflib.VEC3,
        min=mins,
        max=maxs,
    )
    pos_accessor.byteOffset = None
    gltf.accessors.append(pos_accessor)
    attr_kwargs = {"POSITION": 0}
    draco_attributes = {"POSITION": 0}

    if normals is not None:
        norm_accessor = Accessor(
            componentType=pygltflib.FLOAT,
            count=len(normals),
            type=pygltflib.VEC3,
        )
        norm_accessor.byteOffset = None
        gltf.accessors.append(norm_accessor)
        attr_kwargs["NORMAL"] = 1
        draco_attributes["NORMAL"] = 1

    idx_accessor = Accessor(
        componentType=pygltflib.UNSIGNED_INT,
        count=faces.size,
        type=pygltflib.SCALAR,
    )
    idx_accessor.byteOffset = None
    idx_accessor_index = len(gltf.accessors)
    gltf.accessors.append(idx_accessor)

    primitive = pygltflib.Primitive(
        attributes=Attributes(**attr_kwargs),
        indices=idx_accessor_index,
        mode=pygltflib.TRIANGLES,
    )
    primitive.extensions = {
        "KHR_draco_mesh_compression": {
            "bufferView": 0,
            "attributes": draco_attributes,
        }
    }

    gltf_mesh = pygltflib.Mesh(primitives=[primitive])
    gltf.meshes.append(gltf_mesh)

    node = pygltflib.Node(mesh=0)
    gltf.nodes.append(node)
    scene = pygltflib.Scene(nodes=[0])
    gltf.scenes.append(scene)
    gltf.scene = 0

    gltf.extensionsUsed = ["KHR_draco_mesh_compression"]
    gltf.extensionsRequired = ["KHR_draco_mesh_compression"]

    gltf.set_binary_blob(draco_padded)
    gltf.save(out_path)

    import os

    print(f"wrote {out_path}: {os.path.getsize(out_path)} bytes")

    # --- round-trip sanity check: decode what we just wrote back with DracoPy ---
    check = GLTF2().load(out_path)
    blob = check.binary_blob()
    bv = check.bufferViews[0]
    draco_chunk = blob[bv.byteOffset or 0 : (bv.byteOffset or 0) + bv.byteLength]
    decoded = DracoPy.decode(draco_chunk)
    print(f"round-trip decode: {len(decoded.points)} verts, {len(decoded.faces)} faces")
    print(f"original (pre-encode) input to DracoPy: {len(positions)} verts, {len(faces)} faces")
    if len(decoded.points) != len(positions) or len(decoded.faces) != len(faces):
        print(
            "MISMATCH: DracoPy's points+faces encode() welded/deduplicated "
            "vertices that share a position but had different per-corner "
            "attributes (e.g. split/hard-edge normals from the glTF export's "
            "non-indexed layout). It changed mesh topology, not just encoding "
            "it losslessly -- this is the manual-buffer-manipulation gap the "
            "ticket asked us to check for."
        )
    else:
        print("round-trip OK: vertex/face counts match original export")


if __name__ == "__main__":
    main()
