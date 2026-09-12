import {build} from 'esbuild';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const files = {
  'app.js': 'text/javascript; charset=utf-8',
  'lookup-ui.mjs': 'text/javascript; charset=utf-8',
  'mobile-components.mjs': 'text/javascript; charset=utf-8',
  'image-url.mjs': 'text/javascript; charset=utf-8',
  'style.css': 'text/css; charset=utf-8',
  'favicon.svg': 'image/svg+xml',
  'assets/akinator-placeholder.svg': 'image/svg+xml',
  'assets/akinator-pictureless.webp': 'image/webp',
};
const entries = await Promise.all(Object.entries(files).map(async ([file, type]) => {
  const bytes = await readFile('public/' + file);
  const body = type === 'image/webp' ? `Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0))` : JSON.stringify(bytes.toString('utf8'));
  return `[${JSON.stringify('/' + file)},{type:${JSON.stringify(type)},body:${body}}]`;
}));
await rm('dist', {recursive: true, force: true});
await mkdir('dist/server', {recursive: true});
await mkdir('dist/.openai', {recursive: true});
await build({
  entryPoints: ['worker.mjs'], outfile: 'dist/server/index.js', bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', sourcemap: false,
  plugins: [{name: 'site-assets', setup(builder) {
    builder.onResolve({filter: /^site-assets$/}, () => ({path: 'site-assets', namespace: 'assets'}));
    builder.onLoad({filter: /.*/, namespace: 'assets'}, () => ({contents: `export default new Map([${entries.join(',')}]);`, loader: 'js'}));
  }}],
});
await writeFile('dist/.openai/hosting.json', await readFile('.openai/hosting.json'));
const worker = (await import('../dist/server/index.js?' + Date.now())).default;
if (typeof worker?.fetch !== 'function') throw Error('The build must export a callable Worker fetch handler.');
console.log('Built the lookup Worker and its exact asset allowlist. No framework or runtime packages are bundled.');
