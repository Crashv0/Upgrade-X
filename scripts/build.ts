// Builds Melvor Idle 1 mods into mods/<Mod>/dist/: bundles the setup entry with
// Rolldown (imported CSS becomes setup.css), minifies every *.template.html into
// templates.min.html, and copies manifest.json, src/img and src/assets. With --zip,
// also packages dist/ as mods/<Mod>/package/<Mod>@v<version>.zip, the file mod.io gets.
//
//   bun scripts/build.ts <Mod>... | --all   [--zip] [--no-minify]
//
// --all builds the mods listed in modio.json. A path instead of a name (e.g. `.` in a
// mod's public repo) builds that folder as one mod, into its own dist/ and package/.

import { rolldown, type Plugin } from 'rolldown';
import { minify as minifyHtml } from 'html-minifier-terser';
import { transform as transformCss } from 'lightningcss';
import { zipSync } from 'fflate';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const ENTRIES = ['src/ts/setup.ts', 'src/js/setup.mjs'];

async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else out.push(path);
  }
  return out.toSorted();
}

// Rolldown doesn't bundle CSS, so imported stylesheets become empty modules here and
// are joined, in the order they were loaded, into one setup.css next to setup.mjs
// (manifests load it through "load"). Each mod has a single entry, so that order
// follows the imports.
function stylesheets(minify: boolean): Plugin {
  const sources = new Map<string, string>();
  return {
    name: 'stylesheets',
    async load(id) {
      if (!id.endsWith('.css')) return null;
      sources.set(id, await readFile(id, 'utf8'));
      return { code: '', moduleType: 'js' };
    },
    generateBundle() {
      if (sources.size === 0) return;
      const { code } = transformCss({
        filename: 'setup.css',
        code: new TextEncoder().encode([...sources.values()].join('\n')),
        minify,
      });
      this.emitFile({ type: 'asset', fileName: 'setup.css', source: code });
    },
  };
}

async function bundle(modDir: string, outDir: string, minify: boolean) {
  const entry = ENTRIES.map((e) => join(modDir, e)).find(existsSync);
  if (!entry) throw new Error(`no entry point (${ENTRIES.join(' or ')})`);
  const build = await rolldown({
    input: { setup: entry },
    platform: 'browser',
    transform: { target: 'es2020' },
    plugins: [stylesheets(minify)],
  });
  await build.write({
    dir: outDir,
    format: 'es',
    minify,
    entryFileNames: '[name].mjs',
    assetFileNames: 'assets/[name][extname]',
  });
  await build.close();
}

async function templates(modDir: string, outDir: string) {
  const src = join(modDir, 'src');
  const found = (await files(src)).filter((f) => f.endsWith('.template.html'));
  if (found.length === 0) return;
  let html = '';
  for (const file of found) {
    html += await minifyHtml(await readFile(file, 'utf8'), {
      collapseWhitespace: true,
      collapseInlineTagWhitespace: true,
      removeComments: true,
    });
  }
  await writeFile(join(outDir, 'templates.min.html'), html);
}

async function copyStatic(modDir: string, outDir: string) {
  await cp(join(modDir, 'manifest.json'), join(outDir, 'manifest.json'));
  for (const dir of ['img', 'assets']) {
    const from = join(modDir, 'src', dir);
    if (existsSync(from))
      await cp(from, join(outDir, dir), { recursive: true });
  }
}

async function zip(
  mod: string,
  modDir: string,
  outDir: string,
  version: string,
) {
  const entries: Record<string, Uint8Array> = {};
  for (const file of await files(outDir)) {
    entries[relative(outDir, file).replaceAll('\\', '/')] = new Uint8Array(
      await readFile(file),
    );
  }
  const packageDir = join(modDir, 'package');
  await rm(packageDir, { recursive: true, force: true });
  await mkdir(packageDir, { recursive: true });
  const path = join(packageDir, `${mod}@v${version}.zip`);
  await writeFile(path, zipSync(entries, { level: 9 }));
  return path;
}

/** A mod name means mods/<Mod>; anything with a path separator, or `.`, is a mod folder. */
function modFolder(arg: string): { mod: string; modDir: string } {
  if (arg === '.' || arg.includes('/') || arg.includes('\\')) {
    const modDir = resolve(arg);
    return { mod: basename(modDir), modDir };
  }
  return { mod: arg, modDir: join(ROOT, 'mods', arg) };
}

async function buildMod(arg: string, opts: { zip: boolean; minify: boolean }) {
  const started = performance.now();
  const { mod, modDir } = modFolder(arg);
  if (!existsSync(join(modDir, 'manifest.json')))
    throw new Error(`no manifest.json in ${modDir}`);
  const { version } = JSON.parse(
    await readFile(join(modDir, 'manifest.json'), 'utf8'),
  );
  const outDir = join(modDir, 'dist');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await bundle(modDir, outDir, opts.minify);
  await templates(modDir, outDir);
  await copyStatic(modDir, outDir);
  const zipped = opts.zip ? await zip(mod, modDir, outDir, version) : null;

  const ms = (performance.now() - started).toFixed(0);
  console.log(
    `${mod} v${version}: built in ${ms} ms${zipped ? `, ${relative(process.cwd(), zipped)}` : ''}`,
  );
}

const args = process.argv.slice(2);
const opts = {
  zip: args.includes('--zip'),
  minify: !args.includes('--no-minify'),
};
let mods = args.filter((a) => !a.startsWith('--'));
if (args.includes('--all')) {
  mods = Object.keys(
    JSON.parse(await readFile(join(ROOT, 'modio.json'), 'utf8')).mods,
  );
}
if (mods.length === 0) {
  console.error(
    'usage: bun scripts/build.ts <Mod>... | --all  [--zip] [--no-minify]',
  );
  process.exit(1);
}

let failed = false;
for (const mod of mods) {
  try {
    await buildMod(mod, opts);
  } catch (err) {
    failed = true;
    console.error(
      `${mod}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
process.exit(failed ? 1 : 0);
