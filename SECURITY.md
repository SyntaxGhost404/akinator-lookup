# Security review

The public-release scenario is a threat model. The actual Sites audience remains owner-only. The application adds no password, CAPTCHA, sign-in screen, or user access gate.

## Implemented boundaries

- The Worker exposes only the root page, six explicit asset paths (the bundled client script, boot script, stylesheet, favicon and two placeholder images), and the existing instances, search, suggest, prepare, reset, and placeholder API paths. The build confirms that source modules are not served. Unsupported routes and methods fail before any engine operation. Framework action deserialization, arbitrary file serving, database examples, and image optimization routes were removed with their dependencies.
- JSON lookup bodies are limited to 8 KiB while streaming, including chunked bodies. Reading has a five-second deadline. Inputs require the expected object shape and field types, a supported instance key, a bounded query, and valid session fields. Compressed input, form submissions, excessive JSON nesting, invalid UTF-8, control characters and unknown fields are rejected.
- Origin and Fetch Metadata checks reject cross-origin browser requests, including other origins on the same site. No permissive CORS policy or JSONP endpoint exists. These checks are browser request-forgery protection, not authentication of arbitrary HTTP clients. Clients outside a browser can forge these headers.
- The server resolves engine addresses exclusively through the fixed Akinator directory and its trusted HTTPS domain boundaries. Session bases must match that instance's advertised endpoints. The API accepts no arbitrary fetch target. Credentials in URLs and redirects are rejected; APK-advertised service ports remain supported. The image allowlist is shared by the server and renderer, with the original custom image bytes served by their source host.
- HMAC-SHA-256 covers the session ID, step, instance, engine base, operation lane, expiry and application origin. The 256-bit signing key is a managed runtime secret, excluded from the client, repository, logs and archive. Verification uses Web Crypto. Tokens expire after 24 hours and renew during normal use. Forged fields are rejected before contacting an engine. Legacy unsigned fields are ignored and bootstrapped. Session signatures protect integrity, not confidentiality or user identity; they are not globally single-use replay tokens. Engine step validation still governs accepted operations.
- JSON responses and HTML are private and non-cacheable. Assets are privately cached with explicit types and `nosniff`. Referrers are suppressed. The page has a strict Content Security Policy, per-response script nonce, disabled inline handlers/eval, restricted media/network origins and embedding limited to the site and ChatGPT. Browser permissions unrelated to lookup are disabled. Dynamic geometry, including the squircle clip paths, uses CSSOM properties, which remain compatible with the inline-style restriction. The page carries a content-hash version on every asset URL; the server accepts only a hexadecimal build version there. The nonce also supports the hosting provider's injected bot-detection script. [Cloudflare CSP integration](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/#if-you-have-a-content-security-policy-csp), [CSSOM and CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr).
- Entry names, descriptions, suggestions, raw metadata and errors use text nodes. No response becomes HTML, script, CSS, or a server command. Copy actions write to the clipboard only from the person's own tap. The image link opens only allowlisted HTTPS image hosts, with `noreferrer`. Expected engine validation remains inspectable after removing the active session ID. Unexpected exceptions expose neither a stack trace nor raw upstream content. Logs contain generic failure categories without queries, tokens or user records.
- Popular entries returned with session preparation pass through the same normalization and image allowlist as search results; their text is rendered literally. They add no route or input field.
- The browser stores only appearance, haptic, language, category and image filter preferences in `localStorage`. Queries, results and sessions are never written to storage. Haptics use the Vibration API or a hidden, unfocusable switch control, only during user gestures.

## Resource handling

| Control | Bound |
| --- | --- |
| API body | 8 KiB, five-second read deadline |
| Upstream response | 4 MiB, no silent truncation |
| Shared response accounting | 8 MiB of upstream input across active handlers, held through serialization |
| Individual engine call | 15 seconds maximum |
| Session operation after discovery | 45 seconds total, including failover and recovery |
| Browser transport | 65 seconds before cancellation |
| Traffic per client address | 120-unit burst, replenished at 20 units/second |
| Worker traffic | 480-unit burst, replenished at 80 units/second |
| In-flight API handlers | 24 per isolate, 16 per client address |
| Traffic accounting | At most 2,048 client entries; inactive entries expire after one minute |
| Fresh session cost | Five units; reset costs 20 units |
| Upstream overload | Honor HTTP 429/503 backoff, capped at 60 seconds |

The address is the platform-supplied `CF-Connecting-IP`; `X-Forwarded-For` is not used. Missing or malformed addresses share a bounded fallback bucket. The guard assumes the hosting edge supplies trustworthy Cloudflare headers. It must not be placed behind a proxy that forwards client-controlled versions of those headers unchanged.

Limits use Worker-local memory and therefore apply per isolate. They protect this process from bursts and resource exhaustion; they do not provide a coordinated global quota, prevent distributed scraping, or guarantee availability during a network-wide attack. A genuine public launch additionally needs host-managed WAF/rate policies, infrastructure capacity controls, monitoring and incident response. This conversation does not provide administrative control of the Sites hosting zone, so those controls have not been configured or claimed. Even Cloudflare's native rate-limiting binding counts per location rather than providing one globally coordinated counter. [Cloudflare rate-limiting scope](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

Session serialization, caches and cancellation epochs remain tab-local. The legacy-corner observer now releases removed cards and picker rows. Directory resets are coalesced over five seconds, and an older refresh cannot overwrite a newer cache result. These controls add no persistent query store or background game-completion traffic. Reactive views own their listeners and observers and release them when a view closes.

## Supply chain and checks

The 2026-09-12 baseline audit reported 61 vulnerabilities across the inherited dependency tree, including 2 critical and 36 high findings. These are dependency advisories, not proof those paths were exploitable in the previous deployed app. The unused framework, component, database, stylesheet and tooling dependencies were removed. The remaining build tool is pinned to esbuild 0.28.1. Its complete 27-package lockfile, including optional platform binaries, returned zero known vulnerabilities on the follow-up audit. There are no third-party runtime dependencies. Lockfile integrity, package release-age controls and explicit build-script policy remain enabled.

Regression and adversarial tests cover malformed and cross-origin requests, chunked/oversized/stalled bodies, shared memory accounting, signature forgery and expiry, quota exhaustion and release, URL boundaries, safe error output, actual adapter request order, idle-session recovery, every image state and the full phone, tablet and desktop interface. The page shell and stylesheet are pinned by reviewed digests, and a design test rejects emoji, dash characters and colors outside the approved palette. These checks do not constitute a formal penetration test or prove security under every possible condition.

For an incident, keep the Site private, use the provider's access controls, rotate `LOOKUP_SESSION_SECRET` through Sites and deploy the reviewed version. A token signed by a replaced key is rejected; the tab drops that session and the next query bootstraps normally. Do not put runtime secrets in `.openai/hosting.json` or a public asset. Re-run the dependency audit and functional checks when changing the build tool or service protocol.
