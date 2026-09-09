#!/usr/bin/env python3
"""Read-only Blender DNA object/rig inventory without Blender.

Usage: python inspect_blend.py character.blend --output report.json
Lists original datablock/object names, mesh sizes, armatures and modifiers.
Does not execute embedded scripts, inspect author's file paths, or render assets.
"""

from __future__ import annotations

import argparse
import contextlib
import gzip
import json
import mmap
import re
import shutil
import struct
import tempfile
from collections import Counter
from pathlib import Path


class Blend:
    def __init__(self, data):
        self.data = data
        if data[:7] != b"BLENDER":
            raise ValueError("Not an uncompressed Blender file")
        self.pointer_size = 8 if data[7:8] == b"-" else 4
        self.endian = "<" if data[8:9] == b"v" else ">"
        self.version = data[9:12].decode("ascii", "replace")
        self.pointer_fmt = "Q" if self.pointer_size == 8 else "I"
        self.block_fmt = self.endian + "4sI" + self.pointer_fmt + "II"
        self.header_size = struct.calcsize(self.block_fmt)
        self.blocks = []
        self.by_address = {}
        offset = 12
        while offset + self.header_size <= len(data):
            code, length, old_address, sdna, count = struct.unpack_from(self.block_fmt, data, offset)
            block = {"code": code.rstrip(b"\x00").decode("ascii", "replace"),
                     "size": length, "address": old_address, "sdna": sdna,
                     "count": count, "offset": offset + self.header_size}
            if block["offset"] + length > len(data):
                raise ValueError("Blender block extends past end of file")
            self.blocks.append(block)
            if old_address:
                self.by_address[old_address] = block
            if code == b"ENDB":
                break
            offset += self.header_size + length
        dna = next((b for b in self.blocks if b["code"] == "DNA1"), None)
        if not dna:
            raise ValueError("Blender DNA block is missing")
        self.read_dna(dna)

    def read_dna(self, block):
        offset = block["offset"]
        if self.data[offset:offset + 8] != b"SDNANAME":
            raise ValueError("Unsupported Blender DNA header")
        offset += 8

        def read_strings(position):
            count = struct.unpack_from(self.endian + "I", self.data, position)[0]
            position += 4
            values = []
            for _ in range(count):
                end = self.data.find(b"\x00", position)
                if end < 0:
                    raise ValueError("Unterminated DNA string")
                values.append(self.data[position:end].decode("utf-8", "replace"))
                position = end + 1
            return values, (position + 3) & ~3

        self.names, offset = read_strings(offset)
        if self.data[offset:offset + 4] != b"TYPE":
            raise ValueError("Missing DNA TYPE")
        self.types, offset = read_strings(offset + 4)
        if self.data[offset:offset + 4] != b"TLEN":
            raise ValueError("Missing DNA TLEN")
        offset += 4
        self.type_lengths = struct.unpack_from(self.endian + "H" * len(self.types), self.data, offset)
        offset = (offset + 2 * len(self.types) + 3) & ~3
        if self.data[offset:offset + 4] != b"STRC":
            raise ValueError("Missing DNA STRC")
        offset += 4
        count = struct.unpack_from(self.endian + "I", self.data, offset)[0]
        offset += 4
        self.structs = []
        self.by_type = {}
        for i in range(count):
            type_index, field_count = struct.unpack_from(self.endian + "HH", self.data, offset)
            offset += 4
            fields, field_offset = {}, 0
            for _ in range(field_count):
                field_type, field_name = struct.unpack_from(self.endian + "HH", self.data, offset)
                offset += 4
                declared = self.names[field_name]
                pointer = "*" in declared
                dimensions = [int(n) for n in re.findall(r"\[(\d+)\]", declared)]
                length = self.pointer_size if pointer else self.type_lengths[field_type]
                elements = 1
                for dimension in dimensions:
                    elements *= dimension
                length *= elements
                name = re.sub(r"\[\d+\]", "", declared).replace("*", "").strip("()")
                fields[name] = {"offset": field_offset, "type": self.types[field_type],
                                "length": length, "pointer": pointer, "elements": elements}
                field_offset += length
            item = {"name": self.types[type_index], "fields": fields,
                    "size": self.type_lengths[type_index], "computed_size": field_offset}
            self.structs.append(item)
            self.by_type[item["name"]] = i

    def view(self, block):
        if block is None or block["sdna"] >= len(self.structs):
            return None
        return View(self, block["offset"], self.structs[block["sdna"]])

    def resolve(self, address):
        return self.view(self.by_address.get(address))

    def datablocks(self, type_name):
        for block in self.blocks:
            if block["sdna"] < len(self.structs) and self.structs[block["sdna"]]["name"] == type_name:
                yield self.view(block)


class View:
    def __init__(self, blend, offset, schema):
        self.blend, self.offset, self.schema = blend, offset, schema

    def get(self, key, default=None):
        if "." in key:
            head, tail = key.split(".", 1)
            value = self.get(head)
            return value.get(tail, default) if isinstance(value, View) else default
        field = self.schema["fields"].get(key)
        if field is None:
            return default
        offset = self.offset + field["offset"]
        if field["pointer"]:
            return struct.unpack_from(self.blend.endian + self.blend.pointer_fmt, self.blend.data, offset)[0]
        if field["type"] == "char" and field["elements"] > 1:
            raw = self.blend.data[offset:offset + field["length"]]
            return raw.split(b"\x00", 1)[0].decode("utf-8", "replace")
        schema_index = self.blend.by_type.get(field["type"])
        if schema_index is not None:
            return View(self.blend, offset, self.blend.structs[schema_index])
        formats = {"char": "b", "uchar": "B", "short": "h", "ushort": "H", "int": "i",
                   "uint": "I", "int8_t": "b", "uint8_t": "B", "int16_t": "h", "uint16_t": "H",
                   "int32_t": "i", "uint32_t": "I", "int64_t": "q", "uint64_t": "Q",
                   "float": "f", "double": "d"}
        fmt = formats.get(field["type"])
        if fmt:
            values = struct.unpack_from(self.blend.endian + str(field["elements"]) + fmt,
                                        self.blend.data, offset)
            return values[0] if len(values) == 1 else list(values)
        return default

    def reference(self, key):
        return self.blend.resolve(self.get(key))

    def id_name(self):
        name = self.get("id.name", "")
        return name[2:] if isinstance(name, str) else ""


def linked_list(blend, first, next_key="next"):
    seen = set()
    address = first
    while address and address not in seen:
        seen.add(address)
        view = blend.resolve(address)
        if view is None:
            break
        yield view
        address = view.get(next_key)


def inventory(blend, source):
    objects = []
    armatures = []
    for obj in blend.datablocks("Object"):
        data = obj.reference("data")
        parent = obj.reference("parent")
        item = {"name": obj.id_name(), "object_type_id": obj.get("type"),
                "data_type": data.schema["name"] if data else None,
                "data_name": data.id_name() if data else None,
                "parent_object": parent.id_name() if parent else None, "modifiers": []}
        if data and data.schema["name"] == "Mesh":
            item["vertex_count"] = data.get("verts_num", data.get("totvert"))
            item["polygon_count"] = data.get("faces_num", data.get("totpoly", data.get("totface")))
            item["material_slot_count"] = data.get("totcol")
        for mod in linked_list(blend, obj.get("modifiers.first"), "modifier.next"):
            # A concrete modifier starts with embedded ModifierData.
            head = mod.get("modifier")
            if not isinstance(head, View):
                head = mod
            target = mod.reference("object")
            item["modifiers"].append({"name": head.get("name"), "type_id": head.get("type"),
                                      "structure": mod.schema["name"],
                                      "target_object": target.id_name() if target else None})
        objects.append(item)
    for armature in blend.datablocks("bArmature"):
        bone_names = []
        pending = [armature.get("bonebase.first")]
        seen = set()
        while pending:
            first = pending.pop()
            if not first or first in seen:
                continue
            seen.add(first)
            for bone in linked_list(blend, first):
                bone_names.append(bone.get("name"))
                pending.append(bone.get("childbase.first"))
        armatures.append({"name": armature.id_name(), "bone_count": len(bone_names), "bones": bone_names})
    return {
        "file": str(source.resolve()), "blender_file_version": blend.version,
        "pointer_bits": 8 * blend.pointer_size,
        "summary": {"objects": len(objects), "object_data_types": dict(Counter(o["data_type"] for o in objects)),
                    "armature_datablocks": len(armatures)},
        "objects": objects, "armatures": armatures,
        "materials": [m.id_name() for m in blend.datablocks("Material")],
        "actions": [a.id_name() for a in blend.datablocks("bAction")],
        "limitations": ["Read-only DNA inventory; no script execution, scene evaluation or rendering.",
                        "Separate object names do not prove a complete body beneath armor or usable modular equipment.",
                        "Only original datablock structure and Armature modifier targets are established."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    with contextlib.ExitStack() as stack:
        handle = stack.enter_context(args.file.open("rb"))
        magic = handle.read(7)
        handle.seek(0)
        if magic != b"BLENDER":
            temporary = stack.enter_context(tempfile.TemporaryFile())
            if magic[:2] == b"\x1f\x8b":
                reader = stack.enter_context(gzip.GzipFile(fileobj=handle))
            elif magic[:4] == b"\x28\xb5\x2f\xfd":
                import zstandard
                reader = stack.enter_context(zstandard.ZstdDecompressor().stream_reader(handle))
            else:
                raise ValueError("Unsupported .blend container (expected BLENDER, gzip or zstd)")
            shutil.copyfileobj(reader, temporary)
            temporary.flush()
            handle = temporary
        data = stack.enter_context(mmap.mmap(handle.fileno(), 0, access=mmap.ACCESS_READ))
        result = inventory(Blend(data), args.file)
    encoded = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
        print(json.dumps(result["summary"], ensure_ascii=False))
        print(str(args.output.resolve()))
    else:
        print(encoded, end="")


if __name__ == "__main__":
    main()
