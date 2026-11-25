# Akinator Lookup

Private lookup across Akinator categories and languages, built as a mobile-first web application that scales to tablet and desktop. The interface is plain HTML, CSS and browser modules with a small reactive core. A Fetch-compatible Worker runs the existing APK-derived service adapter. There is no framework, server components, image processor, database, upload path or third-party runtime package.

## Source map

| File | Responsibility |
| --- | --- |
| `lib/ui.mjs` | Application shell and the original vector icon set |
| `public/style.css` | Light and dark palettes, squircle surfaces, phone, tablet and desktop layouts |
| `public/boot.js` | Applies the saved theme and squircle renderer before first paint |
| `public/app.js` | Composition root |
| `public/ui/store.mjs` | Lookup state and actions: connection, suggestions, incremental search, retry |
| `public/ui/reactive.mjs` | Signals, effects and owned scopes that release listeners on disposal |
| `public/ui/sheet.mjs` | Bottom sheet and dialog: drag to dismiss, focus containment, motion |
| `public/ui/squircle.mjs` | Continuous-curvature corner paths where CSS `corner-shape` is missing |
| `public/ui/theme.mjs`, `public/ui/haptics.mjs`, `public/ui/prefs.mjs` | Light, Dark and System appearance, haptic feedback, stored preferences |
| `public/ui/controls.mjs`, `public/ui/avatar.mjs` | Pickers, segmented control, switch, chips, disclosure, toasts, avatars |
| `public/views/*.mjs` | Shell, search, results, details and settings views |
| `public/lookup-ui.mjs` | Independent sessions, serialized operation queues and bounded tab caches |
| `public/image-url.mjs` | Shared image URL allowlist |
| `lib/lookup.mjs` | Discovery, engine selection and Akinator protocol |
| `lib/server.mjs` | Exact route and asset dispatch |
| `lib/security.mjs`, `lib/http.mjs` | Validation, session integrity, resource bounds and response policies |
| `scripts/build.mjs` | Bundles the client and the Worker with the explicit asset list for Sites |

The build tool is pinned in `pnpm-lock.yaml`. Install with the declared pnpm version and `pnpm install --frozen-lockfile`, then run `pnpm build`. The client modules are bundled into one minified `app.js`; the stylesheet and boot script are minified. Every asset URL in the page carries one content hash, so a deploy never mixes old and new files. The output is `dist/server/index.js` and `dist/.openai/hosting.json`. Only the six listed assets are embedded and served, and the build verifies that source modules return 404. Source, tests, environment files, source maps and development tooling are absent from the deployed artifact. Keep publication owner-only through Sites.

`pnpm dev` builds and runs the same handler on `http://127.0.0.1:5173`. The development server binds only to loopback, checks the Host header and creates a disposable signing key in memory. Restart it after changing source. Production uses the `LOOKUP_SESSION_SECRET` secret configured in Sites. Never publish the development server.

## Interface

Phones keep everything in the thumb zone: the search field, category chips and language sit in a bottom dock that rides above the keyboard. Results show a large title that collapses into the top bar, a sticky image filter with live counts, and cards that open a bottom sheet with previous and next controls in its footer. Sheets follow the finger and close on a deliberate downward swipe, Close, Back or Escape; a tap outside answers with a small bounce instead of dismissing. At 720 px a sidebar holds language and category and search moves to the top. At 1180 px entry details stay open in an inspector beside the results. `/` or Ctrl K focuses search; arrow keys or J and K step through matches while details are showing.

Before any search, a single category shows its popular entries, so the database is browsable without typing. They come from the toplist the engine already returns while a session is prepared, which the lookup used to discard. Each card shows its popularity rank, and details add the rank and how many times the entry has been played. Searching replaces the list; clearing brings it back.

Containers, buttons, fields, chips, badges, sheets and avatars use continuous-curvature corners: CSS `corner-shape: squircle` where supported, otherwise a clip path drawing the same superellipse, with matching border and focus rings. Light and dark palettes are designed separately; System follows the device live. Haptic feedback is a setting: Android uses the Vibration API and iOS 18 Safari the system switch tick, always from the person's own gesture. Theme, haptics, language, category and image filter are stored locally. Queries and results are never stored.

## Protocol

The adapter follows the Android client, verified against Akinator 9.1.22 (version code 406). Session creation sends the same fields as that build, including `client_version` (`9.1.22 (406)`), and no request is signed. The engine reports an expired session with HTTP 422. The lookup renews and retries once when the response is typed `TIMEOUT SESSION` or carries no error type, and surfaces an explicit non-timeout type, such as a parameter rejection, unchanged. Named engine conditions (`ENGINE REFUSAL`, `TECHNICAL ERROR`, `SERVER DOWN`, a bad media profile) and HTTP 403 blocks from the hosting edge get their own plain messages, with the original diagnostic kept. The search DTO carries only name, description, ID and picture; ranking and play counts exist only in the toplist. When a newer client build is verified, update `CLIENT_VERSION` in `lib/lookup.mjs`.

## Preserved behavior

Discovery uses `instances_v3.php`, `URL_BASE_WS2`, and the ordered `CANDIDATS/URL` values, including their advertised HTTPS ports. For `lre` instances, the language suffix is retained. Session creation is followed by `set-and-get-toplist` before either `suggest-objects` or `set-and-get-searchlist`. Every subsequent request stays pinned to its successful engine. No answer, successful-guess confirmation, award claim, or game-finish endpoint is called.

Search and autocomplete have separate sessions per category in each browser tab. Forty-millisecond autocomplete scheduling, local suggestions, stale queue skipping, background preparation, independent category results, and the native fetch receiver wrapper remain intact. Completed calls retain their next engine step even if the input changes. The tab cache keeps at most 150 entries and approximately 3 MiB, with five-minute suggestions and one-minute searches. No search history is persisted.

Language selections stay in the active submenu with explicit Back and Close. The 18 known service language aliases retain their original routing codes and full display names. Avatar containers keep square coverage at the source resolution. Pictureless entries request the official default URL with the unchanged APK silhouette as fallback; Unspecified alone uses the generic vector; custom entries retain their full source URL and image retry behavior. The fallback's `image/webp` MIME type is explicit. When several categories are searched, a failed category can be retried alone while the others keep their results.

An expired session (see Protocol) is renewed and retried once in the original request. Signed client session fields protect that state from tampering. Old unsigned sessions from open tabs are discarded and automatically bootstrapped. Returned entry metadata, original successful responses and category separation are preserved.

## Verification

Run `pnpm test` for adapter, transport, security, page and stylesheet digests, and the design rules. The adapter tests cover typed and untyped HTTP 422 renewal, `client_version`, and popular entries from preparation. `test-design.mjs` rejects emoji, em and en dashes, standalone hyphens in copy, and any color outside the neutral, gold, red and green families; it also covers the reactive core, squircle geometry, error copy, preferences and haptics.

`test-mobile-flow.mjs` executes the actual browser modules in a DOM environment. Run `pnpm test:mobile` where jsdom is available, or set `JSDOM_MODULE` to the absolute jsdom entrypoint in a separate QA environment. It covers Moin and Polly selections, all four categories with incremental results and single-category retry, the popular browse and its handover to search, the language submenu, image filters and fallbacks, details navigation by buttons, keys and swipes, copy, Light, Dark and System themes with live tracking, the haptics toggle, drag to dismiss, the wide inspector handover, cache and session races, reconnect, keyboard resize, observer cleanup and safe rendering of untrusted text. This is functional DOM verification, not phone rendering or a touch-scroll performance measurement.

See `SECURITY.md` for the defensive boundaries and deployment responsibilities.
