import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

// The source archives accompany the LGPL WASM on the same static hosting.
// Commit URLs and expected digests are pinned; a changed archive fails the build.
export const cadSourceArchives = Object.freeze([
  {
    file: "opencascade.js-b5ff984.tar.gz",
    url: "https://codeload.github.com/donalffons/opencascade.js/tar.gz/b5ff9847200016dce0d92fe747fc38a945771dc5",
    sha256: "879c482fc6a4e9cc07e8b73f064b6cf2cd74f698106abc7c9c5870a95ede9269",
  },
  {
    file: "opencascade.js-1544593.tar.gz",
    url: "https://codeload.github.com/donalffons/opencascade.js/tar.gz/15445938357138fd30f07a126a9bd874054af7d8",
    sha256: "441476d2fd26b79b38dd9aa38177bb809047d76a0ce94bd63ae2e55e85edbc15",
  },
  {
    file: "occt-bb368e2.tar.gz",
    url: "https://codeload.github.com/Open-Cascade-SAS/OCCT/tar.gz/bb368e271e24f63078129283148ce83db6b9670a",
    sha256: "fabda9f139f2c09e675d5b9717110175b0ad5d9fb09187e3d56687220d2687e6",
  },
]);

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

export async function prepareCadSources(root, destination) {
  const cache = path.join(root, ".cad-source-cache");
  await mkdir(cache, { recursive: true });
  await mkdir(destination, { recursive: true });
  for (const archive of cadSourceArchives) {
    const cachedPath = path.join(cache, archive.file);
    let data;
    try {
      data = await readFile(cachedPath);
      if (sha256(data) !== archive.sha256) data = undefined;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!data) {
      console.log(`Descargando fuentes CAD: ${archive.file}`);
      const response = await fetch(archive.url, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok)
        throw new Error(`No se pudieron descargar ${archive.file}: HTTP ${response.status}.`);
      data = Buffer.from(await response.arrayBuffer());
      if (sha256(data) !== archive.sha256)
        throw new Error(`Las fuentes ${archive.file} no coinciden con el SHA-256 fijado.`);
      const temporary = `${cachedPath}.tmp`;
      await writeFile(temporary, data);
      await rename(temporary, cachedPath);
    }
    await cp(cachedPath, path.join(destination, archive.file));
  }

  // Publish the integration sources, manifest and scripts alongside the library
  // so recipients can substitute a compatible modified kernel and rebuild.
  const application = path.join(destination, "application");
  await rm(application, { recursive: true, force: true });
  await mkdir(path.join(application, "cad"), { recursive: true });
  for (const entry of await readdir(path.join(root, "cad"), { withFileTypes: true })) {
    if (entry.name === "public" || entry.name.startsWith(".")) continue;
    await cp(path.join(root, "cad", entry.name), path.join(application, "cad", entry.name), { recursive: true });
  }
  for (const file of ["package.json", "package-lock.json", "vite.config.mjs", "scripts/build.mjs", "scripts/dev.mjs", "scripts/cad-sources.mjs", "docs/cad/ORIGEN_CAD.md", "docs/cad/ATLAS.md"]) {
    await mkdir(path.dirname(path.join(application, file)), { recursive: true });
    await cp(path.join(root, file), path.join(application, file));
  }
  await cp(path.join(root, "cad", "public"), path.join(application, "cad", "public"), {
    recursive: true,
    filter: (source) => !path.relative(path.join(root, "cad", "public"), source).split(path.sep).includes("source"),
  });
  const applicationArchive = "cad-application.tar.gz";
  await run("tar", ["-czf", path.join(destination, applicationArchive), "-C", destination, "application"]);
  const applicationHash = sha256(await readFile(path.join(destination, applicationArchive)));
  await writeFile(path.join(destination, "SHA256SUMS.txt"), [
    ...cadSourceArchives.map((archive) => `${archive.sha256}  ${archive.file}`),
    `${applicationHash}  ${applicationArchive}`,
  ].join("\n") + "\n");
  await writeFile(path.join(destination, "MANIFEST.json"), JSON.stringify({
    package: "opencascade.js@2.0.0-beta.b5ff984",
    archives: cadSourceArchives,
    applicationArchive: { file: applicationArchive, sha256: applicationHash },
    notes: [
      "El sufijo b5ff984 y gitHead npm 1544593 identifican momentos distintos de la publicación upstream; se suministran ambas revisiones.",
      "El Dockerfile fija OCCT bb368e2 y Emscripten 3.1.14; RapidJSON y FreeType se clonan sin fijar revisión.",
      "No se promete reproducibilidad binaria idéntica de una recompilación upstream.",
      "application/ contiene los fuentes de integración y configuración usados por esta entrega.",
    ],
  }, null, 2) + "\n");
  await writeFile(path.join(destination, "README.txt"), [
    "Fuentes correspondientes al motor CAD distribuido en este sitio.",
    "Los archivos .tar.gz son copias verificadas de revisiones upstream; SHA256SUMS.txt contiene sus hashes.",
    "application/ contiene el editor y su manifiesto npm. Se permite modificar esta integración para uso propio y depurar su uso con una biblioteca modificada, conforme a la sección 6 de LGPL 2.1.",
    "Para compilar solo CAD: npm ci; npx vite build --config vite.config.mjs.",
    "Para usar un motor compatible modificado, reemplazar opencascade.full.js y opencascade.full.wasm en node_modules/opencascade.js/dist/ antes de compilar.",
    "Consultar application/docs/cad/ORIGEN_CAD.md y ../SOURCES.txt para procedencia, comandos de reconstrucción upstream y licencias.",
  ].join("\n") + "\n");
  console.log("Fuentes y materiales de reproducción CAD preparados en dist/cad/licenses/source/.");
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  await prepareCadSources(root, path.join(root, "dist/cad/licenses/source"));
}
