export default `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content"><meta name="theme-color" content="#171714"><title>Akinator Lookup</title><link rel="preconnect" href="https://photos.clarinea.fr"><link rel="stylesheet" href="/style.css?v=15"><script type="module" src="/app.js?v=16"></script></head>
<body>
<svg class="symbols" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>
<symbol id="i-search" viewBox="0 0 24 24"><rect x="3" y="3" width="13" height="13" rx="4"/><path d="m16 16 5 5"/></symbol>
<symbol id="i-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>
<symbol id="i-options" viewBox="0 0 24 24"><path d="M3 7h7m4 0h7M3 17h11m4 0h3"/><rect x="10" y="4" width="4" height="6" rx="1"/><rect x="14" y="14" width="4" height="6" rx="1"/></symbol>
<symbol id="i-next" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></symbol>
<symbol id="i-retry" viewBox="0 0 24 24"><path d="M20 9V4l-3 3a8 8 0 1 0 2 10M20 9h-5"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></symbol><symbol id="i-back" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></symbol><symbol id="i-file" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h4"/></symbol>
</defs></svg>
<div class="app" id="app">
<header><div><p class="brand">Akinator</p><h1>Lookup</h1></div><button class="icon-button" id="info" aria-label="About this lookup"><svg><use href="#i-file"/></svg></button></header>
<main id="main" tabindex="0" aria-label="Lookup results"><div class="results-heading"><h2 id="resulttitle">Find an entry</h2><span id="count"></span></div><p id="notice" role="status">Choose a category and start typing.</p><div id="error" role="alert" hidden></div><section id="results" aria-label="Search results"></section><button id="responses" class="text-button" hidden><svg><use href="#i-file"/></svg>All returned data</button></main>
<div class="dock" id="dock">
<div class="suggestion-panel" id="suggestion-panel" hidden><div class="suggestion-heading"><span id="suggestion-status" role="status">Suggestions</span><button class="icon-button small" id="dismiss" aria-label="Close suggestions"><svg><use href="#i-close"/></svg></button></div><ul id="suggestions" role="listbox" aria-label="Suggestions"></ul></div>
<form id="searchform"><div class="search-field"><svg><use href="#i-search"/></svg><input id="query" type="text" inputmode="search" placeholder="Name or title" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" minlength="2" maxlength="200" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggestions" aria-label="Name or title"><button type="button" class="icon-button small" id="clear" aria-label="Clear search" hidden><svg><use href="#i-close"/></svg></button></div>
<div class="dock-actions"><button id="search" class="dock-action search-submit" type="submit" disabled><svg aria-hidden="true"><use href="#i-next"/></svg><span>Search</span></button><button id="options" class="dock-action" type="button"><svg aria-hidden="true"><use href="#i-options"/></svg><span>Settings</span></button></div></form>
<p id="connection" role="status">Connecting…</p></div>
</div>
<div id="sheet-layer" class="sheet-layer" hidden>
<div class="sheet-shade" aria-hidden="true"></div>
<section id="sheet" class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
<div class="sheet-header"><button id="sheet-back" class="icon-button" aria-label="Back" hidden><svg><use href="#i-back"/></svg></button><h2 id="sheet-title">Search options</h2><button id="sheet-close" class="icon-button" aria-label="Close panel"><svg><use href="#i-close"/></svg></button></div>
<div id="sheet-content" class="sheet-body"></div>
</section></div>
</body></html>`;
