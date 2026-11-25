import {build, transform} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
// The client modules are bundled into one script. Only the files listed here
// are embedded and served; source modules, tests and tooling are not.
const client = await build({
  entryPoints: ['public/app.js'], bundle: true, write: false, format: 'esm', minify: true,
  target: ['es2020', 'chrome100', 'safari15', 'firefox100'], legalComments: 'none', sourcemap: false,
});
const text = async (file, loader) => (await transform(await readFile(file, 'utf8'), {loader, minify: true, legalComments: 'none'})).code;
const files = {
  '/app.js': {type: 'text/javascript; charset=utf-8', body: client.outputFiles[0].text},
  '/boot.js': {type: 'text/javascript; charset=utf-8', body: await text('public/boot.js', 'js')},
  '/style.css': {type: 'text/css; charset=utf-8', body: await text('public/style.css', 'css')},
  '/favicon.svg': {type: 'image/svg+xml', body: await readFile('public/favicon.svg', 'utf8')},
  '/assets/akinator-placeholder.svg': {type: 'image/svg+xml', body: await readFile('public/assets/akinator-placeholder.svg', 'utf8')},
  '/assets/akinator-pictureless.webp': {type: 'image/webp', body: await readFile('public/assets/akinator-pictureless.webp')},
};
// One content version for every asset URL in the page.
const hash = createHash('sha256');
for (const [path, {body}] of Object.entries(files)) hash.update(path).update(body);
const version = hash.digest('hex').slice(0, 12);
const entries = Object.entries(files).map(([path, {type, body}]) => {
  const encoded = typeof body === 'string' ? JSON.stringify(body)
    : `Uint8Array.from(atob(${JSON.stringify(body.toString('base64'))}),c=>c.charCodeAt(0))`;
  return `[${JSON.stringify(path)},{type:${JSON.stringify(type)},body:${encoded}}]`;
});
await rm('dist', {recursive: true, force: true});
await mkdir('dist/server', {recursive: true});
await mkdir('dist/.openai', {recursive: true});
await build({
  entryPoints: ['worker.mjs'], outfile: 'dist/server/index.js', bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', sourcemap: false,
  plugins: [{name: 'site-assets', setup(builder) {
    builder.onResolve({filter: /^site-assets$/}, () => ({path: 'site-assets', namespace: 'assets'}));
    builder.onLoad({filter: /.*/, namespace: 'assets'}, () => ({
      contents: `const assets=new Map([${entries.join(',')}]);assets.version=${JSON.stringify(version)};export default assets;`, loader: 'js',
    }));
  }}],
});
await writeFile('dist/.openai/hosting.json', await readFile('.openai/hosting.json'));
const worker = (await import('../dist/server/index.js?' + Date.now())).default;
if (typeof worker?.fetch !== 'function') throw Error('The build must export a callable Worker fetch handler.');
// Serve exactly the listed assets, never source modules, and stamp the version.
for (const [path, status] of [...Object.keys(files).map(path => [path, 200]), ['/ui/store.mjs', 404], ['/lookup-ui.mjs', 404], ['/views/details.mjs', 404]]) {
  const response = await worker.fetch(new Request('https://build.check' + path));
  if (response.status !== status) throw Error(`Asset allowlist check failed for ${path}: HTTP ${response.status}`);
}
if (!(await (await worker.fetch(new Request('https://build.check/'))).text()).includes('/app.js?v=' + version)) {
  throw Error('The page must reference the built asset version.');
}
const size = Object.values(files).reduce((total, {body}) => total + (typeof body === 'string' ? Buffer.byteLength(body) : body.length), 0);
console.log(`Built the lookup Worker with ${Object.keys(files).length} assets (${(size / 1024).toFixed(1)} KiB, version ${version}). No framework or runtime packages are bundled.`);
