#!/usr/bin/env python3
"""Read-only structural FBX inspection. Python standard library, no renderer.

Usage: python inspect_fbx.py model.fbx [--output report.json]
Supports binary FBX (32-/64-bit node headers) and ordinary ASCII FBX.
Does not evaluate transforms, extract embedded files, or prove visual modularity.
"""

from __future__ import annotations

import argparse
import array
import json
import mmap
import re
import struct
import sys
import zlib
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ArrayData:
    count: int
    kind: str = "ascii"
    offset: int = 0
    byte_length: int = 0
    encoding: int = 0
    negative_count: int | None = None


@dataclass
class Node:
    name: str
    props: list = field(default_factory=list)
    children: list = field(default_factory=list)

    def child(self, name):
        return next((n for n in self.children if n.name == name), None)


def text_name(value):
    return str(value).replace("\x00\x01", "::").replace("\x00", "")


class BinaryReader:
    def __init__(self, data):
        self.data = data
        self.version = struct.unpack_from("<I", data, 23)[0]
        self.header_fmt = "<QQQB" if self.version >= 7500 else "<IIIB"
        self.header_size = struct.calcsize(self.header_fmt)

    def property(self, offset):
        kind = chr(self.data[offset])
        offset += 1
        scalar = {"Y": "h", "C": "?", "I": "i", "F": "f", "D": "d", "L": "q"}
        if kind in scalar:
            fmt = "<" + scalar[kind]
            return struct.unpack_from(fmt, self.data, offset)[0], offset + struct.calcsize(fmt)
        if kind in "fdlibc":
            count, encoding, length = struct.unpack_from("<III", self.data, offset)
            offset += 12
            if offset + length > len(self.data):
                raise ValueError("Array extends past end of file")
            return ArrayData(count, kind, offset, length, encoding), offset + length
        if kind in "SR":
            length = struct.unpack_from("<I", self.data, offset)[0]
            offset += 4
            if offset + length > len(self.data):
                raise ValueError("String/raw property extends past end of file")
            value = (self.data[offset:offset + length].decode("utf-8", "replace")
                     if kind == "S" else {"raw_bytes": length})
            return value, offset + length
        raise ValueError(f"Unsupported binary FBX property type {kind!r} at {offset - 1}")

    def node(self, offset, parent_end):
        if offset + self.header_size > parent_end:
            raise ValueError("Truncated FBX node header")
        end, prop_count, prop_bytes, name_len = struct.unpack_from(self.header_fmt, self.data, offset)
        if end == 0:
            return None, offset + self.header_size
        if not offset < end <= parent_end:
            raise ValueError(f"Invalid FBX node end offset {end}")
        offset += self.header_size
        name = self.data[offset:offset + name_len].decode("utf-8", "replace")
        offset += name_len
        prop_end = offset + prop_bytes
        if prop_end > end:
            raise ValueError("Properties extend beyond their node")
        props = []
        for _ in range(prop_count):
            value, offset = self.property(offset)
            props.append(value)
        if offset != prop_end:
            raise ValueError(f"Property length mismatch in {name}")
        children = []
        while offset < end:
            child, offset = self.node(offset, end)
            if child is None:
                break
            children.append(child)
        return Node(name, props, children), end

    def read(self):
        nodes, offset = [], 27
        while offset + self.header_size <= len(self.data):
            node, offset = self.node(offset, len(self.data))
            if node is None:
                break
            nodes.append(node)
        return Node("root", children=nodes)

    def negatives(self, data):
        if data.kind not in ("i", "l"):
            return None
        payload = self.data[data.offset:data.offset + data.byte_length]
        if data.encoding == 1:
            payload = zlib.decompress(payload)
        elif data.encoding != 0:
            raise ValueError(f"Unsupported FBX array encoding {data.encoding}")
        values = array.array("i" if data.kind == "i" else "q")
        expected = data.count * values.itemsize
        if len(payload) != expected:
            raise ValueError(f"FBX array length mismatch: {len(payload)} != {expected}")
        values.frombytes(payload)
        if sys.byteorder != "little":
            values.byteswap()
        return sum(v < 0 for v in values)


class AsciiReader:
    # Keep newlines: ASCII FBX uses both braces and line ends as delimiters.
    token_re = re.compile(r'[ \t\r]+|;[^\n]*|\n|"(?:\\.|[^"\\])*"|[{}:,*]|[^\s{}:,*;]+')

    def __init__(self, data):
        self.tokens = (m.group(0) for m in self.token_re.finditer(data)
                       if not m.group(0).startswith((" ", "\t", "\r", ";")))
        self.current = next(self.tokens, None)
        self.version = None

    def pop(self):
        result = self.current
        self.current = next(self.tokens, None)
        return result

    @staticmethod
    def value(token):
        if token.startswith('"'):
            # FBX paths can contain non-JSON backslashes, so avoid unicode_escape.
            return token[1:-1].replace('\\"', '"').replace('\\\\', '\\')
        try:
            return int(token)
        except ValueError:
            try:
                return float(token)
            except ValueError:
                return token

    def read_nodes(self, nested=False):
        nodes = []
        while self.current is not None:
            if self.current == "\n":
                self.pop()
                continue
            if self.current == "}":
                if not nested:
                    raise ValueError("Unmatched closing brace in ASCII FBX")
                self.pop()
                return nodes
            name = self.pop()
            if self.pop() != ":":
                raise ValueError(f"Expected colon after ASCII FBX node {name!r}")
            props, children = [], []
            # Array a: payloads may wrap lines. Count values without retaining them.
            if name == "a":
                count = negatives = 0
                while self.current not in (None, "}"):
                    token = self.pop()
                    if token in (",", "\n"):
                        continue
                    value = self.value(token)
                    if not isinstance(value, (int, float)):
                        raise ValueError("Unexpected non-numeric ASCII array data")
                    count += 1
                    negatives += value < 0
                props = [ArrayData(count, negative_count=negatives)]
            else:
                while self.current not in (None, "\n", "}"):
                    token = self.pop()
                    if token == "{":
                        children = self.read_nodes(nested=True)
                        break
                    if token in (",", "*"):
                        continue
                    value = self.value(token)
                    props.append({"encoded_chars": len(value)} if name == "Content" and isinstance(value, str) else value)
            nodes.append(Node(name, props, children))
        if nested:
            raise ValueError("Unclosed ASCII FBX node")
        return nodes

    def read(self):
        root = Node("root", children=self.read_nodes())
        header = root.child("FBXHeaderExtension")
        version = header.child("FBXVersion") if header else None
        self.version = version.props[0] if version and version.props else None
        return root

    @staticmethod
    def negatives(data):
        return data.negative_count


def node_array(node):
    if node is None:
        return None
    candidates = node.props + [p for c in node.children if c.name == "a" for p in c.props]
    return next((p for p in candidates if isinstance(p, ArrayData)), None)


def first_prop(node, default=None):
    return node.props[0] if node and node.props else default


def make_report(root, reader, source, file_size):
    objects_node = root.child("Objects")
    objects = objects_node.children if objects_node else []
    by_id = {n.props[0]: n for n in objects if n.props and isinstance(n.props[0], int)}
    incoming, outgoing = defaultdict(list), defaultdict(list)
    connections = root.child("Connections")
    for node in connections.children if connections else []:
        if node.name in ("C", "Connect") and len(node.props) >= 3:
            kind, src, dst, *rest = node.props
            outgoing[src].append((dst, kind, rest))
            incoming[dst].append((src, kind, rest))

    def desc(node):
        return {"id": node.props[0], "name": text_name(node.props[1]) if len(node.props) > 1 else "",
                "subtype": node.props[2] if len(node.props) > 2 else ""}

    def connected(identity, table, object_type=None, subtype=None):
        return [desc(by_id[other]) for other, _, _ in table[identity]
                if other in by_id and (object_type is None or by_id[other].name == object_type)
                and (subtype is None or (len(by_id[other].props) > 2 and by_id[other].props[2] == subtype))]

    geometry, mesh_models, bones, materials, deformers, animations, textures = [], [], [], [], [], [], []
    for node in objects:
        if not node.props:
            continue
        item = desc(node)
        identity, subtype = item["id"], item["subtype"]
        if node.name == "Geometry" and subtype == "Mesh":
            vertices = node_array(node.child("Vertices"))
            indices = node_array(node.child("PolygonVertexIndex"))
            item.update(vertex_count=vertices.count // 3 if vertices else None,
                        polygon_vertex_index_count=indices.count if indices else None,
                        polygon_count=reader.negatives(indices) if indices else None,
                        model_connections=connected(identity, outgoing, "Model"),
                        skin_connections=connected(identity, incoming, "Deformer", "Skin"))
            uv_layers = [n for n in node.children if n.name == "LayerElementUV"]
            item["uv_layer_count"] = len(uv_layers)
            geometry.append(item)
        elif node.name == "Model":
            item["parent_models"] = connected(identity, outgoing, "Model")
            if subtype == "Mesh":
                item["geometry_connections"] = connected(identity, incoming, "Geometry")
                item["material_connections"] = connected(identity, incoming, "Material")
                mesh_models.append(item)
            elif subtype in ("LimbNode", "Root"):
                bones.append(item)
        elif node.name == "Material":
            materials.append(item)
        elif node.name == "Deformer":
            indices = node_array(node.child("Indexes"))
            item["weighted_vertex_count"] = indices.count if indices else None
            item["bone_connections"] = connected(identity, incoming, "Model")
            item["parent_deformers"] = connected(identity, outgoing, "Deformer")
            item["geometry_connections"] = connected(identity, outgoing, "Geometry")
            deformers.append(item)
        elif node.name == "AnimationStack":
            animations.append(item)
        elif node.name in ("Texture", "Video"):
            item["object_type"] = node.name
            item["file_name"] = first_prop(node.child("FileName"), first_prop(node.child("Filename")))
            item["relative_file_name"] = first_prop(node.child("RelativeFilename"))
            content = node.child("Content")
            item["embedded_content"] = bool(content and content.props)
            if content and content.props and isinstance(content.props[0], dict):
                item["embedded_content_size"] = content.props[0]
            textures.append(item)
    return {
        "file": str(source.resolve()), "file_bytes": file_size,
        "format": "binary" if isinstance(reader, BinaryReader) else "ascii", "fbx_version": reader.version,
        "object_counts": dict(sorted(Counter(n.name for n in objects).items())),
        "summary": {"mesh_models": len(mesh_models), "mesh_geometries": len(geometry),
                    "vertices": sum(g["vertex_count"] or 0 for g in geometry),
                    "polygons": sum(g["polygon_count"] or 0 for g in geometry),
                    "materials": len(materials), "bone_models": len(bones),
                    "skin_deformers": sum(d["subtype"] == "Skin" for d in deformers),
                    "animation_stacks": len(animations)},
        "mesh_models": mesh_models, "geometry": geometry, "materials": materials,
        "bones": bones, "deformers": deformers, "animation_stacks": animations, "textures": textures,
        "limitations": [
            "Structural inspection only; no rendering, deformation, topology separation or transform evaluation.",
            "Mesh names and material groups do not prove a complete body under armor or interchangeable equipment.",
            "Polygon count is not triangle count; n-gons are counted as single polygons.",
            "Texture filenames and embedded byte counts are listed; texture data is never extracted.",
            "ASCII support targets ordinary FBX node syntax; legacy pre-7.x object schemas may yield incomplete inventories.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--output", type=Path, help="Write JSON here instead of stdout")
    args = parser.parse_args()
    with args.file.open("rb") as handle:
        with mmap.mmap(handle.fileno(), 0, access=mmap.ACCESS_READ) as data:
            if data[:23] == b"Kaydara FBX Binary  \x00\x1a\x00":
                reader = BinaryReader(data)
            else:
                reader = AsciiReader(data[:].decode("utf-8-sig", "replace"))
            report = make_report(reader.read(), reader, args.file, len(data))
    output = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
        print(json.dumps(report["summary"], ensure_ascii=False))
        print(str(args.output.resolve()))
    else:
        print(output, end="")


if __name__ == "__main__":
    main()
