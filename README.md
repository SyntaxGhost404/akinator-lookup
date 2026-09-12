# Akinator Lookup

Private mobile lookup across Akinator categories and languages. The interface is plain HTML, CSS and browser modules. A small Fetch-compatible Worker runs the existing APK-derived service adapter. No framework, server components, image processor, database, uploads, or third-party runtime packages are included.

## Source map

| File | Responsibility |
| --- | --- |
| `lib/ui.mjs`, `public/style.css` | Existing page and mobile presentation |
| `public/app.js` | Settings, autocomplete, incremental results and metadata inspection |
| `public/lookup-ui.mjs` | Independent sessions, serialized operation queues and bounded tab caches |
| `public/mobile-components.mjs` | Custom sheets, pickers, avatars and viewport geometry |
| `public/image-url.mjs` | Shared image URL allowlist |
| `lib/lookup.mjs` | Discovery, engine selection and Akinator protocol |
| `lib/server.mjs` | Exact route and asset dispatch |
| `lib/security.mjs`, `lib/http.mjs` | Validation, session integrity, resource bounds and response policies |
| `scripts/build.mjs` | Bundles the Worker and the explicit asset list for Sites |

The build tool is pinned in `pnpm-lock.yaml`. Install with the declared pnpm version and `pnpm install --frozen-lockfile`, then run `pnpm build`. The output is `dist/server/index.js` and `dist/.openai/hosting.json`. Only the listed public assets are embedded and served. Source, tests, environment files, source maps, and development tooling are absent from the deployed artifact. Keep publication owner-only through Sites.

`pnpm dev` builds and runs the same handler on `http://127.0.0.1:5173`. The development server binds only to loopback, checks the Host header, and creates a disposable signing key in memory. Restart it after changing source. Production uses the `LOOKUP_SESSION_SECRET` secret configured in Sites. Never publish the development server.

## Preserved behavior

Discovery uses `instances_v3.php`, `URL_BASE_WS2`, and the ordered `CANDIDATS/URL` values, including their advertised HTTPS ports. For `lre` instances, the language suffix is retained. Session creation is followed by `set-and-get-toplist` before either `suggest-objects` or `set-and-get-searchlist`. Every subsequent request stays pinned to its successful engine. No answer, successful-guess confirmation, award claim, or game-finish endpoint is called.

Search and autocomplete have separate sessions per category in each browser tab. Forty-millisecond autocomplete scheduling, local suggestions, stale queue skipping, background preparation, independent category results, and the native fetch receiver wrapper remain intact. Completed calls retain their next engine step even if the input changes. The tab cache keeps at most 150 entries and approximately 3 MiB, with five-minute suggestions and one-minute searches. No search history is persisted.

Category, Language and Images selections stay in the active submenu. Back and Close are explicit. The 18 known service language aliases retain their original routing codes and full display names. Avatar containers retain the same square coverage and squircle geometry. Pictureless entries request the official default URL with the unchanged APK silhouette as fallback; Unspecified alone uses the generic vector; custom entries retain their full source URL and image retry behavior. The fallback's `image/webp` MIME type is explicit.

A typed `TIMEOUT SESSION` response renews the affected session and retries once in the original request. Signed client session fields protect that state from tampering. Old unsigned sessions from open tabs are discarded and automatically bootstrapped. Returned entry metadata, original successful responses and category separation are preserved.

## Verification

Run `pnpm test` for adapter, transport, security and exact page/CSS baseline regressions. The baseline comparison uses golden page and stylesheet digests, so it also works in a fresh clone or source archive without the private Site history.

`test-mobile-flow.mjs` executes the actual browser modules in a DOM environment. Run `pnpm test:mobile` where jsdom is available, or set `JSDOM_MODULE` to the absolute jsdom entrypoint in a separate QA environment. It covers Moin and Polly selections, all four categories, in-place settings, language labels, image states, cache and session races, retry, reconnect, keyboard resize, legacy corner observation, and safe rendering of untrusted text. This is functional DOM verification, not phone rendering or a touch-scroll performance measurement.

See `SECURITY.md` for the defensive boundaries and deployment responsibilities.
