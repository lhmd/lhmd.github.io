import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = "assets/mesh/gallery";
const outputRoot = "assets/mesh/gallery-web";
const maxFaces = 240000;
const coordinateLimit = 10000;
const headerTerminator = Buffer.from("end_header\n");

const scalarTypes = {
  char: { size: 1, read: (buffer, offset) => buffer.readInt8(offset) },
  int8: { size: 1, read: (buffer, offset) => buffer.readInt8(offset) },
  uchar: { size: 1, read: (buffer, offset) => buffer.readUInt8(offset) },
  uint8: { size: 1, read: (buffer, offset) => buffer.readUInt8(offset) },
  short: { size: 2, read: (buffer, offset) => buffer.readInt16LE(offset) },
  int16: { size: 2, read: (buffer, offset) => buffer.readInt16LE(offset) },
  ushort: { size: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) },
  uint16: { size: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) },
  int: { size: 4, read: (buffer, offset) => buffer.readInt32LE(offset) },
  int32: { size: 4, read: (buffer, offset) => buffer.readInt32LE(offset) },
  uint: { size: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) },
  uint32: { size: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) },
  float: { size: 4, read: (buffer, offset) => buffer.readFloatLE(offset) },
  float32: { size: 4, read: (buffer, offset) => buffer.readFloatLE(offset) },
  double: { size: 8, read: (buffer, offset) => buffer.readDoubleLE(offset) },
  float64: { size: 8, read: (buffer, offset) => buffer.readDoubleLE(offset) },
};

function parseHeader(buffer) {
  const headerEnd = buffer.indexOf(headerTerminator);
  if (headerEnd < 0) throw new Error("Missing PLY header terminator");

  const text = buffer.subarray(0, headerEnd + headerTerminator.length).toString("ascii");
  const lines = text.trimEnd().split(/\r?\n/);
  const elements = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "ply" || line.startsWith("comment ") || line === "end_header") continue;
    const parts = line.split(/\s+/);
    if (parts[0] === "format") {
      if (parts[1] !== "binary_little_endian") {
        throw new Error(`Unsupported PLY format: ${parts[1]}`);
      }
      continue;
    }

    if (parts[0] === "element") {
      current = { name: parts[1], count: Number(parts[2]), properties: [] };
      elements.push(current);
      continue;
    }

    if (parts[0] === "property" && current) {
      if (parts[1] === "list") {
        current.properties.push({
          kind: "list",
          countType: parts[2],
          itemType: parts[3],
          name: parts[4],
        });
      } else {
        current.properties.push({ kind: "scalar", type: parts[1], name: parts[2] });
      }
    }
  }

  return {
    bodyOffset: headerEnd + headerTerminator.length,
    elements,
    vertex: elements.find((element) => element.name === "vertex"),
    face: elements.find((element) => element.name === "face"),
  };
}

function scalarReader(type) {
  const reader = scalarTypes[type];
  if (!reader) throw new Error(`Unsupported scalar type: ${type}`);
  return reader;
}

function elementStride(element) {
  return element.properties.reduce((sum, property) => {
    if (property.kind === "list") return null;
    return sum + scalarReader(property.type).size;
  }, 0);
}

function readScalarProperty(buffer, baseOffset, element, propertyName) {
  let offset = baseOffset;
  for (const property of element.properties) {
    if (property.kind !== "scalar") throw new Error(`Unexpected list property in ${element.name}`);
    const reader = scalarReader(property.type);
    if (property.name === propertyName) return reader.read(buffer, offset);
    offset += reader.size;
  }
  return undefined;
}

function skipElement(buffer, offset, element) {
  let cursor = offset;
  for (const property of element.properties) {
    if (property.kind === "scalar") {
      cursor += scalarReader(property.type).size;
      continue;
    }

    const countReader = scalarReader(property.countType);
    const itemReader = scalarReader(property.itemType);
    const count = countReader.read(buffer, cursor);
    cursor += countReader.size + count * itemReader.size;
  }
  return cursor;
}

function readFace(buffer, offset, faceElement) {
  let cursor = offset;
  let indices = null;

  for (const property of faceElement.properties) {
    if (property.kind === "scalar") {
      cursor += scalarReader(property.type).size;
      continue;
    }

    const countReader = scalarReader(property.countType);
    const itemReader = scalarReader(property.itemType);
    const count = countReader.read(buffer, cursor);
    cursor += countReader.size;
    const values = [];
    for (let index = 0; index < count; index += 1) {
      values.push(itemReader.read(buffer, cursor));
      cursor += itemReader.size;
    }
    if (property.name === "vertex_indices" || property.name === "vertex_index") indices = values;
  }

  return { nextOffset: cursor, indices };
}

function regularFaceSampleStep(faceCount) {
  if (faceCount <= maxFaces) return 1;
  return faceCount / maxFaces;
}

async function convertMesh(inputPath, outputPath) {
  const input = await readFile(inputPath);
  const header = parseHeader(input);
  if (!header.vertex || !header.face) throw new Error(`Missing vertex or face element in ${inputPath}`);

  const vertexStride = elementStride(header.vertex);
  if (!vertexStride) throw new Error(`Unsupported vertex list property in ${inputPath}`);
  const vertexStart = header.bodyOffset;
  let cursor = vertexStart + header.vertex.count * vertexStride;
  const valid = new Uint8Array(header.vertex.count);
  let invalidVertices = 0;

  for (let index = 0; index < header.vertex.count; index += 1) {
    const offset = vertexStart + index * vertexStride;
    const x = readScalarProperty(input, offset, header.vertex, "x");
    const y = readScalarProperty(input, offset, header.vertex, "y");
    const z = readScalarProperty(input, offset, header.vertex, "z");
    const ok =
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(z) &&
      Math.abs(x) < coordinateLimit &&
      Math.abs(y) < coordinateLimit &&
      Math.abs(z) < coordinateLimit;
    valid[index] = ok ? 1 : 0;
    if (!ok) invalidVertices += 1;
  }

  const faces = [];
  const used = new Uint8Array(header.vertex.count);
  const sampleStep = regularFaceSampleStep(header.face.count);
  let sampleAccumulator = 0;
  let skippedFaces = 0;

  for (let faceIndex = 0; faceIndex < header.face.count; faceIndex += 1) {
    const face = readFace(input, cursor, header.face);
    cursor = face.nextOffset;

    sampleAccumulator += 1;
    if (sampleStep > 1 && sampleAccumulator < sampleStep) continue;
    sampleAccumulator -= sampleStep;

    if (!face.indices || face.indices.length !== 3) {
      skippedFaces += 1;
      continue;
    }

    const [a, b, c] = face.indices;
    const ok =
      a >= 0 &&
      b >= 0 &&
      c >= 0 &&
      a < header.vertex.count &&
      b < header.vertex.count &&
      c < header.vertex.count &&
      a !== b &&
      b !== c &&
      a !== c &&
      valid[a] &&
      valid[b] &&
      valid[c];

    if (!ok) {
      skippedFaces += 1;
      continue;
    }

    faces.push(a, b, c);
    used[a] = 1;
    used[b] = 1;
    used[c] = 1;
  }

  const remap = new Int32Array(header.vertex.count);
  remap.fill(-1);
  let vertexCount = 0;
  for (let index = 0; index < header.vertex.count; index += 1) {
    if (!used[index]) continue;
    remap[index] = vertexCount;
    vertexCount += 1;
  }

  const faceCount = faces.length / 3;
  const outputHeader = Buffer.from(
    [
      "ply",
      "format binary_little_endian 1.0",
      "comment TriSplat web gallery mesh",
      "comment generated by scripts/build-web-meshes.mjs",
      `element vertex ${vertexCount}`,
      "property float x",
      "property float y",
      "property float z",
      "property uchar red",
      "property uchar green",
      "property uchar blue",
      "property uchar alpha",
      `element face ${faceCount}`,
      "property list uchar int vertex_indices",
      "end_header",
      "",
    ].join("\n"),
  );

  const output = Buffer.alloc(outputHeader.length + vertexCount * 16 + faceCount * 13);
  outputHeader.copy(output, 0);
  let writeOffset = outputHeader.length;

  for (let index = 0; index < header.vertex.count; index += 1) {
    if (remap[index] < 0) continue;
    const offset = vertexStart + index * vertexStride;
    output.writeFloatLE(readScalarProperty(input, offset, header.vertex, "x") ?? 0, writeOffset);
    output.writeFloatLE(readScalarProperty(input, offset, header.vertex, "y") ?? 0, writeOffset + 4);
    output.writeFloatLE(readScalarProperty(input, offset, header.vertex, "z") ?? 0, writeOffset + 8);
    output.writeUInt8(Math.round(readScalarProperty(input, offset, header.vertex, "red") ?? 235), writeOffset + 12);
    output.writeUInt8(Math.round(readScalarProperty(input, offset, header.vertex, "green") ?? 238), writeOffset + 13);
    output.writeUInt8(Math.round(readScalarProperty(input, offset, header.vertex, "blue") ?? 231), writeOffset + 14);
    output.writeUInt8(Math.round(readScalarProperty(input, offset, header.vertex, "alpha") ?? 255), writeOffset + 15);
    writeOffset += 16;
  }

  for (let index = 0; index < faces.length; index += 3) {
    output.writeUInt8(3, writeOffset);
    output.writeInt32LE(remap[faces[index]], writeOffset + 1);
    output.writeInt32LE(remap[faces[index + 1]], writeOffset + 5);
    output.writeInt32LE(remap[faces[index + 2]], writeOffset + 9);
    writeOffset += 13;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(`${outputPath}.tmp`, output);
  await rename(`${outputPath}.tmp`, outputPath);

  return {
    input: inputPath,
    output: outputPath,
    vertices: `${header.vertex.count}->${vertexCount}`,
    faces: `${header.face.count}->${faceCount}`,
    invalidVertices,
    skippedFaces,
  };
}

async function listMeshes(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const meshes = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) meshes.push(...(await listMeshes(entryPath)));
    if (entry.isFile() && entry.name.endsWith(".ply")) meshes.push(entryPath);
  }
  return meshes;
}

const meshes = await listMeshes(sourceRoot);
for (const inputPath of meshes.sort()) {
  const outputPath = path.join(outputRoot, path.relative(sourceRoot, inputPath));
  const result = await convertMesh(inputPath, outputPath);
  console.log(
    `${result.output}: vertices ${result.vertices}, faces ${result.faces}, invalid vertices ${result.invalidVertices}, skipped faces ${result.skippedFaces}`,
  );
}
