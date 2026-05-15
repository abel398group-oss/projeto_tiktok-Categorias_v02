import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function parseArgs(argv) {
  const out = {
    dir: process.cwd(),
    deleteOriginal: false,
    overwrite: false,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") {
      const v = argv[i + 1];
      if (v) out.dir = v;
      i += 1;
      continue;
    }
    if (a === "--delete-original") {
      out.deleteOriginal = true;
      continue;
    }
    if (a === "--overwrite") {
      out.overwrite = true;
      continue;
    }
    if (a === "--dry-run") {
      out.dryRun = true;
      continue;
    }
  }

  return out;
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walk(full);
      continue;
    }
    if (!ent.isFile()) continue;
    yield full;
  }
}

function isWebLikeExt(p) {
  const ext = path.extname(p).toLowerCase();
  return ext === ".webp" || ext === ".web";
}

async function convertOne(filePath, opts) {
  const st = await fs.stat(filePath);
  const mtimeIso = st.mtime.toISOString();
  const size = st.size;
  const outPath = filePath.replace(/\.(webp|web)$/i, ".png");

  if (!opts.overwrite && (await fileExists(outPath))) {
    console.log(
      JSON.stringify({ status: "skip_exists", file: filePath, outFile: outPath, mtime: mtimeIso, bytes: size })
    );
    return { ok: true, skipped: true };
  }

  if (opts.dryRun) {
    console.log(
      JSON.stringify({ status: "dry_run", file: filePath, outFile: outPath, mtime: mtimeIso, bytes: size })
    );
    return { ok: true, skipped: true };
  }

  const raw = await fs.readFile(filePath);
  try {
    const png = await sharp(raw, { failOnError: false }).png({ compressionLevel: 9 }).toBuffer();
    await fs.writeFile(outPath, png);
    if (opts.deleteOriginal) {
      await fs.rm(filePath, { force: true });
    }
    const outSt = await fs.stat(outPath);
    console.log(
      JSON.stringify({
        status: "converted",
        file: filePath,
        outFile: outPath,
        mtime: mtimeIso,
        bytes: size,
        outBytes: outSt.size,
        deletedOriginal: opts.deleteOriginal
      })
    );
    return { ok: true, skipped: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ status: "failed", file: filePath, outFile: outPath, mtime: mtimeIso, bytes: size, error: msg }));
    return { ok: false, skipped: false, error: msg };
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const baseDir = path.resolve(opts.dir);

  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for await (const p of walk(baseDir)) {
    if (!isWebLikeExt(p)) continue;
    try {
      const r = await convertOne(p, opts);
      if (!r.ok) {
        failed += 1;
      } else if (r.skipped) {
        skipped += 1;
      } else {
        converted += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(JSON.stringify({ status: "failed", file: p, error: msg }));
      failed += 1;
    }
  }

  const summary = { ok: failed === 0, dir: baseDir, converted, skipped, failed };
  if (failed > 0) {
    console.error(JSON.stringify({ status: "alert", message: "Some files could not be converted (corrupted or incompatible).", ...summary }));
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify({ status: "done", ...summary }));
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(JSON.stringify({ status: "fatal", error: msg }));
  process.exitCode = 1;
});
