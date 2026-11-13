import { gzipSync, gunzipSync } from "node:zlib";
// Chunks stay below Firestore's document limit; a snapshot stays below its transaction limit.
export function pack(state) {
  const text = JSON.stringify(state);
  if (Buffer.byteLength(text) > 40_000_000)
    throw new Error("Personal workspace reached its 40 MB content limit.");
  const data = gzipSync(text);
  if (data.length > 4_000_000)
    throw new Error(
      "Personal workspace reached its 4 MB compressed storage limit.",
    );
  const chunks = [];
  for (let i = 0; i < data.length; i += 650000)
    chunks.push(data.subarray(i, i + 650000));
  return chunks;
}
export function unpack(chunks) {
  return JSON.parse(
    gunzipSync(Buffer.concat(chunks.map((x) => Buffer.from(x))), {
      maxOutputLength: 40_000_000,
    }).toString("utf8"),
  );
}
