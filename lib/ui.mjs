// The application shell. Asset URLs carry a content version that the server
// fills in from the build. Every icon is an original vector symbol.
export default `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f5f5ef" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151512" media="(prefers-color-scheme: dark)">
<title>Akinator Lookup</title>
<link rel="icon" href="/favicon.svg?v=__ASSET_VERSION__" type="image/svg+xml">
<link rel="preconnect" href="https://photos.clarinea.fr">
<script src="/boot.js?v=__ASSET_VERSION__"></script>
<link rel="stylesheet" href="/style.css?v=__ASSET_VERSION__">
<script type="module" src="/app.js?v=__ASSET_VERSION__"></script>
</head>
<body>
<svg class="symbols" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>
<symbol id="i-mark" viewBox="0 0 24 24"><path d="M9.9 4H10.6C13.18 4 14.62 4 15.56 4.94C16.5 5.88 16.5 7.32 16.5 9.9V10.6C16.5 13.18 16.5 14.62 15.56 15.56C14.62 16.5 13.18 16.5 10.6 16.5H9.9C7.32 16.5 5.88 16.5 4.94 15.56C4 14.62 4 13.18 4 10.6V9.9C4 7.32 4 5.88 4.94 4.94C5.88 4 7.32 4 9.9 4Z"/><path class="fill" d="M10.1 8.4H10.4C11.14 8.4 11.56 8.4 11.83 8.67C12.1 8.94 12.1 9.36 12.1 10.1V10.4C12.1 11.14 12.1 11.56 11.83 11.83C11.56 12.1 11.14 12.1 10.4 12.1H10.1C9.36 12.1 8.94 12.1 8.67 11.83C8.4 11.56 8.4 11.14 8.4 10.4V10.1C8.4 9.36 8.4 8.94 8.67 8.67C8.94 8.4 9.36 8.4 10.1 8.4Z"/><path d="m15.4 15.4 4.6 4.6"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><path d="M9.7 3.5H10.3C13.01 3.5 14.53 3.5 15.51 4.49C16.5 5.47 16.5 6.99 16.5 9.7V10.3C16.5 13.01 16.5 14.53 15.51 15.51C14.53 16.5 13.01 16.5 10.3 16.5H9.7C6.99 16.5 5.47 16.5 4.49 15.51C3.5 14.53 3.5 13.01 3.5 10.3V9.7C3.5 6.99 3.5 5.47 4.49 4.49C5.47 3.5 6.99 3.5 9.7 3.5Z"/><path d="m15.3 15.3 5.2 5.2"/></symbol>
<symbol id="i-close" viewBox="0 0 24 24"><path d="m6.5 6.5 11 11m0-11-11 11"/></symbol>
<symbol id="i-arrow-right" viewBox="0 0 24 24"><path d="M4.5 12h14.5m-5.5-5.5L19 12l-5.5 5.5"/></symbol>
<symbol id="i-chevron-right" viewBox="0 0 24 24"><path d="m9.5 5.5 6.5 6.5-6.5 6.5"/></symbol>
<symbol id="i-chevron-left" viewBox="0 0 24 24"><path d="m14.5 5.5-6.5 6.5 6.5 6.5"/></symbol>
<symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="m6 9.5 6 6 6-6"/></symbol>
<symbol id="i-settings" viewBox="0 0 24 24"><path d="M3.5 7H13m4 0h3.5M3.5 17H6m4 0h10.5"/><path d="M14.8 4H15.2C15.99 4 16.43 4 16.71 4.29C17 4.57 17 5.01 17 5.8V8.2C17 8.99 17 9.43 16.71 9.71C16.43 10 15.99 10 15.2 10H14.8C14.01 10 13.57 10 13.29 9.71C13 9.43 13 8.99 13 8.2V5.8C13 5.01 13 4.57 13.29 4.29C13.57 4 14.01 4 14.8 4ZM7.8 14H8.2C8.99 14 9.43 14 9.71 14.29C10 14.57 10 15.01 10 15.8V18.2C10 18.99 10 19.43 9.71 19.71C9.43 20 8.99 20 8.2 20H7.8C7.01 20 6.57 20 6.29 19.71C6 19.43 6 18.99 6 18.2V15.8C6 15.01 6 14.57 6.29 14.29C6.57 14 7.01 14 7.8 14Z"/></symbol>
<symbol id="i-info" viewBox="0 0 24 24"><path d="M10.75 3.25H13.25C16.53 3.25 18.36 3.25 19.56 4.44C20.75 5.64 20.75 7.47 20.75 10.75V13.25C20.75 16.53 20.75 18.36 19.56 19.56C18.36 20.75 16.53 20.75 13.25 20.75H10.75C7.47 20.75 5.64 20.75 4.44 19.56C3.25 18.36 3.25 16.53 3.25 13.25V10.75C3.25 7.47 3.25 5.64 4.44 4.44C5.64 3.25 7.47 3.25 10.75 3.25Z"/><path d="M12 11v5.25M12 7.9h.01"/></symbol>
<symbol id="i-retry" viewBox="0 0 24 24"><path d="M19.75 12.55V13.65C19.75 16.54 19.75 18.15 18.7 19.2C17.65 20.25 16.04 20.25 13.15 20.25H10.85C7.96 20.25 6.35 20.25 5.3 19.2C4.25 18.15 4.25 16.54 4.25 13.65V11.35C4.25 8.46 4.25 6.85 5.3 5.8C6.35 4.75 7.96 4.75 10.85 4.75H14.75"/><path d="m12.25 2.15 2.6 2.6-2.6 2.6"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></symbol>
<symbol id="i-copy" viewBox="0 0 24 24"><path d="M13.5 8.5H15.5C17.69 8.5 18.91 8.5 19.7 9.3C20.5 10.09 20.5 11.31 20.5 13.5V15.5C20.5 17.69 20.5 18.91 19.7 19.7C18.91 20.5 17.69 20.5 15.5 20.5H13.5C11.31 20.5 10.09 20.5 9.3 19.7C8.5 18.91 8.5 17.69 8.5 15.5V13.5C8.5 11.31 8.5 10.09 9.3 9.3C10.09 8.5 11.31 8.5 13.5 8.5Z"/><path d="M8.5 15.5C6.31 15.5 5.09 15.5 4.3 14.7C3.5 13.91 3.5 12.69 3.5 10.5V8.5C3.5 6.31 3.5 5.09 4.3 4.3C5.09 3.5 6.31 3.5 8.5 3.5H10.5C12.69 3.5 13.91 3.5 14.7 4.3C15.5 5.09 15.5 6.31 15.5 8.5"/></symbol>
<symbol id="i-external" viewBox="0 0 24 24"><path d="M11.5 5.5H9.5C6.88 5.5 5.41 5.5 4.45 6.45C3.5 7.41 3.5 8.88 3.5 11.5V14.5C3.5 17.12 3.5 18.59 4.45 19.55C5.41 20.5 6.88 20.5 9.5 20.5H12.5C15.12 20.5 16.59 20.5 17.55 19.55C18.5 18.59 18.5 17.12 18.5 14.5V13"/><path d="M14.5 3.5h6v6M20.5 3.5l-9 9"/></symbol>
<symbol id="i-image" viewBox="0 0 24 24"><path d="M9.25 4.25H14.75C17.37 4.25 18.84 4.25 19.8 5.2C20.75 6.16 20.75 7.63 20.75 10.25V13.75C20.75 16.37 20.75 17.84 19.8 18.8C18.84 19.75 17.37 19.75 14.75 19.75H9.25C6.63 19.75 5.16 19.75 4.2 18.8C3.25 17.84 3.25 16.37 3.25 13.75V10.25C3.25 7.63 3.25 6.16 4.2 5.2C5.16 4.25 6.63 4.25 9.25 4.25Z"/><path d="m3.6 16.4 4.65-4.65 4.25 4.25 2.25-2.25 5.6 5.6"/><path d="M15.9 7.5H16.1C16.71 7.5 17.05 7.5 17.28 7.72C17.5 7.95 17.5 8.29 17.5 8.9V9.1C17.5 9.71 17.5 10.05 17.28 10.28C17.05 10.5 16.71 10.5 16.1 10.5H15.9C15.29 10.5 14.95 10.5 14.72 10.28C14.5 10.05 14.5 9.71 14.5 9.1V8.9C14.5 8.29 14.5 7.95 14.72 7.72C14.95 7.5 15.29 7.5 15.9 7.5Z"/></symbol>
<symbol id="i-image-off" viewBox="0 0 24 24"><path d="M9.25 4.25H14.75C17.37 4.25 18.84 4.25 19.8 5.2C20.75 6.16 20.75 7.63 20.75 10.25V13.75C20.75 16.37 20.75 17.84 19.8 18.8C18.84 19.75 17.37 19.75 14.75 19.75H9.25C6.63 19.75 5.16 19.75 4.2 18.8C3.25 17.84 3.25 16.37 3.25 13.75V10.25C3.25 7.63 3.25 6.16 4.2 5.2C5.16 4.25 6.63 4.25 9.25 4.25Z"/><path d="m4.5 5.5 15 13"/></symbol>
<symbol id="i-image-unknown" viewBox="0 0 24 24"><path d="M9.25 4.25H14.75C17.37 4.25 18.84 4.25 19.8 5.2C20.75 6.16 20.75 7.63 20.75 10.25V13.75C20.75 16.37 20.75 17.84 19.8 18.8C18.84 19.75 17.37 19.75 14.75 19.75H9.25C6.63 19.75 5.16 19.75 4.2 18.8C3.25 17.84 3.25 16.37 3.25 13.75V10.25C3.25 7.63 3.25 6.16 4.2 5.2C5.16 4.25 6.63 4.25 9.25 4.25Z"/><path d="M9.9 9.9c0-1.25 1-2.15 2.15-2.15 1.2 0 2.1.85 2.1 2 0 1.6-2.15 1.85-2.15 3.35M12 16.25h.01"/></symbol>
<symbol id="i-sun" viewBox="0 0 24 24"><path d="M11.6 8H12.4C13.97 8 14.85 8 15.43 8.57C16 9.15 16 10.03 16 11.6V12.4C16 13.97 16 14.85 15.43 15.43C14.85 16 13.97 16 12.4 16H11.6C10.03 16 9.15 16 8.57 15.43C8 14.85 8 13.97 8 12.4V11.6C8 10.03 8 9.15 8.57 8.57C9.15 8 10.03 8 11.6 8Z"/><path d="M12 2.75V4.5m0 15v1.75M2.75 12H4.5m15 0h1.75M5.45 5.45l1.25 1.25m10.6 10.6 1.25 1.25m0-13.1L17.3 6.7M6.7 17.3l-1.25 1.25"/></symbol>
<symbol id="i-moon" viewBox="0 0 24 24"><path d="M19.75 14.6A7.75 7.75 0 0 1 9.4 4.25a7.75 7.75 0 1 0 10.35 10.35Z"/></symbol>
<symbol id="i-system" viewBox="0 0 24 24"><path d="M10.75 3.25H13.25C16.53 3.25 18.36 3.25 19.56 4.44C20.75 5.64 20.75 7.47 20.75 10.75V13.25C20.75 16.53 20.75 18.36 19.56 19.56C18.36 20.75 16.53 20.75 13.25 20.75H10.75C7.47 20.75 5.64 20.75 4.44 19.56C3.25 18.36 3.25 16.53 3.25 13.25V10.75C3.25 7.47 3.25 5.64 4.44 4.44C5.64 3.25 7.47 3.25 10.75 3.25Z"/><path class="fill" d="M12 3.25H13.25C16.53 3.25 18.36 3.25 19.56 4.44C20.75 5.64 20.75 7.47 20.75 10.75V13.25C20.75 16.53 20.75 18.36 19.56 19.56C18.36 20.75 16.53 20.75 13.25 20.75H12Z"/></symbol>
<symbol id="i-haptic" viewBox="0 0 24 24"><path d="M11.6 3H12.4C14.41 3 15.54 3 16.27 3.73C17 4.46 17 5.59 17 7.6V16.4C17 18.41 17 19.54 16.27 20.27C15.54 21 14.41 21 12.4 21H11.6C9.59 21 8.46 21 7.73 20.27C7 19.54 7 18.41 7 16.4V7.6C7 5.59 7 4.46 7.73 3.73C8.46 3 9.59 3 11.6 3Z"/><path d="M4.25 9v6m15.5-6v6M1.75 10.75v2.5m20.5-2.5v2.5"/></symbol>
<symbol id="i-language" viewBox="0 0 24 24"><path d="M3.25 19 8 6l4.75 13M5 14.5h6"/><path d="M14.25 7.5h6.5M17.5 5.25V7.5m2.4 0c-.5 3.6-2.35 6.4-5.15 8.25m.9-5.15c1.15 2.45 2.95 4.25 5.1 5.15"/></symbol>
<symbol id="i-person" viewBox="0 0 24 24"><path d="M11.7 3.25H12.3C13.7 3.25 14.48 3.25 14.99 3.76C15.5 4.27 15.5 5.05 15.5 6.45V7.55C15.5 8.95 15.5 9.73 14.99 10.24C14.48 10.75 13.7 10.75 12.3 10.75H11.7C10.3 10.75 9.52 10.75 9.01 10.24C8.5 9.73 8.5 8.95 8.5 7.55V6.45C8.5 5.05 8.5 4.27 9.01 3.76C9.52 3.25 10.3 3.25 11.7 3.25Z"/><path d="M4.75 20.5v-1.1c0-2.8 2.1-5 4.85-5h4.8c2.75 0 4.85 2.2 4.85 5v1.1"/></symbol>
<symbol id="i-cube" viewBox="0 0 24 24"><path d="M12 3.25 19.75 7.5v9L12 20.75 4.25 16.5v-9L12 3.25Z"/><path d="M4.25 7.5 12 11.75l7.75-4.25M12 11.75v9"/></symbol>
<symbol id="i-film" viewBox="0 0 24 24"><path d="M9.25 5.25H14.75C17.37 5.25 18.84 5.25 19.8 6.2C20.75 7.16 20.75 8.63 20.75 11.25V12.75C20.75 15.37 20.75 16.84 19.8 17.8C18.84 18.75 17.37 18.75 14.75 18.75H9.25C6.63 18.75 5.16 18.75 4.2 17.8C3.25 16.84 3.25 15.37 3.25 12.75V11.25C3.25 8.63 3.25 7.16 4.2 6.2C5.16 5.25 6.63 5.25 9.25 5.25Z"/><path d="M3.5 9.5h17M8 5.5l2.25 4M12.75 5.5 15 9.5"/><path d="m10.75 12.25 3.5 2.25-3.5 2.25v-4.5Z"/></symbol>
<symbol id="i-paw" viewBox="0 0 24 24"><path d="M7.25 16.6c0-2.75 2.1-5.1 4.75-5.1s4.75 2.35 4.75 5.1c0 2.05-1.7 3.25-3.3 2.8-.5-.15-.95-.2-1.45-.2s-.95.05-1.45.2c-1.6.45-3.3-.75-3.3-2.8Z"/><path d="M5.25 9.25H5.5C6.16 9.25 6.52 9.25 6.76 9.49C7 9.73 7 10.09 7 10.75V11.5C7 12.16 7 12.52 6.76 12.76C6.52 13 6.16 13 5.5 13H5.25C4.59 13 4.23 13 3.99 12.76C3.75 12.52 3.75 12.16 3.75 11.5V10.75C3.75 10.09 3.75 9.73 3.99 9.49C4.23 9.25 4.59 9.25 5.25 9.25ZM9.1 4.75H9.35C10.01 4.75 10.37 4.75 10.61 4.99C10.85 5.23 10.85 5.59 10.85 6.25V7.25C10.85 7.91 10.85 8.27 10.61 8.51C10.37 8.75 10.01 8.75 9.35 8.75H9.1C8.44 8.75 8.08 8.75 7.84 8.51C7.6 8.27 7.6 7.91 7.6 7.25V6.25C7.6 5.59 7.6 5.23 7.84 4.99C8.08 4.75 8.44 4.75 9.1 4.75ZM14.65 4.75H14.9C15.56 4.75 15.92 4.75 16.16 4.99C16.4 5.23 16.4 5.59 16.4 6.25V7.25C16.4 7.91 16.4 8.27 16.16 8.51C15.92 8.75 15.56 8.75 14.9 8.75H14.65C13.99 8.75 13.63 8.75 13.39 8.51C13.15 8.27 13.15 7.91 13.15 7.25V6.25C13.15 5.59 13.15 5.23 13.39 4.99C13.63 4.75 13.99 4.75 14.65 4.75ZM18.5 9.25H18.75C19.41 9.25 19.77 9.25 20.01 9.49C20.25 9.73 20.25 10.09 20.25 10.75V11.5C20.25 12.16 20.25 12.52 20.01 12.76C19.77 13 19.41 13 18.75 13H18.5C17.84 13 17.48 13 17.24 12.76C17 12.52 17 12.16 17 11.5V10.75C17 10.09 17 9.73 17.24 9.49C17.48 9.25 17.84 9.25 18.5 9.25Z"/></symbol>
<symbol id="i-all" viewBox="0 0 24 24"><path d="M6.7 3.5H7.55C8.95 3.5 9.73 3.5 10.24 4.01C10.75 4.52 10.75 5.3 10.75 6.7V7.55C10.75 8.95 10.75 9.73 10.24 10.24C9.73 10.75 8.95 10.75 7.55 10.75H6.7C5.3 10.75 4.52 10.75 4.01 10.24C3.5 9.73 3.5 8.95 3.5 7.55V6.7C3.5 5.3 3.5 4.52 4.01 4.01C4.52 3.5 5.3 3.5 6.7 3.5ZM16.45 3.5H17.3C18.7 3.5 19.48 3.5 19.99 4.01C20.5 4.52 20.5 5.3 20.5 6.7V7.55C20.5 8.95 20.5 9.73 19.99 10.24C19.48 10.75 18.7 10.75 17.3 10.75H16.45C15.05 10.75 14.27 10.75 13.76 10.24C13.25 9.73 13.25 8.95 13.25 7.55V6.7C13.25 5.3 13.25 4.52 13.76 4.01C14.27 3.5 15.05 3.5 16.45 3.5ZM6.7 13.25H7.55C8.95 13.25 9.73 13.25 10.24 13.76C10.75 14.27 10.75 15.05 10.75 16.45V17.3C10.75 18.7 10.75 19.48 10.24 19.99C9.73 20.5 8.95 20.5 7.55 20.5H6.7C5.3 20.5 4.52 20.5 4.01 19.99C3.5 19.48 3.5 18.7 3.5 17.3V16.45C3.5 15.05 3.5 14.27 4.01 13.76C4.52 13.25 5.3 13.25 6.7 13.25ZM16.45 13.25H17.3C18.7 13.25 19.48 13.25 19.99 13.76C20.5 14.27 20.5 15.05 20.5 16.45V17.3C20.5 18.7 20.5 19.48 19.99 19.99C19.48 20.5 18.7 20.5 17.3 20.5H16.45C15.05 20.5 14.27 20.5 13.76 19.99C13.25 19.48 13.25 18.7 13.25 17.3V16.45C13.25 15.05 13.25 14.27 13.76 13.76C14.27 13.25 15.05 13.25 16.45 13.25Z"/></symbol>
<symbol id="i-tag" viewBox="0 0 24 24"><path d="M3.5 11.25V6c0-1.4 1.1-2.5 2.5-2.5h5.25l9.25 9.25-8 8-9-9.5Z"/><path d="M8 7.75h.01"/></symbol>
<symbol id="i-alert" viewBox="0 0 24 24"><path d="M10.3 4.3 2.8 17.5c-.75 1.3.2 2.9 1.7 2.9h15c1.5 0 2.45-1.6 1.7-2.9L13.7 4.3c-.75-1.3-2.65-1.3-3.4 0Z"/><path d="M12 9.5v4.25M12 16.9h.01"/></symbol>
<symbol id="i-offline" viewBox="0 0 24 24"><path d="M5 19.5v-2.25m4.5 2.25v-5m4.5 5v-8m4.5 8v-11M3.5 3.5l17 17"/></symbol>
<symbol id="i-data" viewBox="0 0 24 24"><path d="M8.5 4.5c-2 0-2.75.9-2.75 2.75v2.1c0 1.45-.75 2.2-2.25 2.65 1.5.45 2.25 1.2 2.25 2.65v2.1c0 1.85.75 2.75 2.75 2.75m7-15c2 0 2.75.9 2.75 2.75v2.1c0 1.45.75 2.2 2.25 2.65-1.5.45-2.25 1.2-2.25 2.65v2.1c0 1.85-.75 2.75-2.75 2.75"/></symbol>
</defs></svg>
<div class="app" id="app" data-connection="connecting">
<header class="topbar" id="topbar">
<div class="brand"><span class="brand-mark sq" aria-hidden="true"><svg class="icon"><use href="#i-mark"/></svg></span><h1 class="brand-name">Akinator Lookup</h1></div>
<p class="topbar-title" id="topbar-title" aria-hidden="true"></p>
<div class="connection" id="connection" data-state="connecting"><span class="pulse" aria-hidden="true"><i></i><i></i><i></i></span><svg class="icon status-icon" aria-hidden="true"><use href="#i-alert"/></svg><span class="connection-text" id="connection-text" role="status">Connecting…</span><button class="text-button sq" id="connection-retry" type="button" hidden>Retry</button></div>
<button class="icon-button sq" id="settings-button" type="button" aria-label="Settings" aria-haspopup="dialog"><svg class="icon" aria-hidden="true"><use href="#i-settings"/></svg></button>
</header>
<nav class="scope" id="scope" aria-label="Search scope">
<button class="language-button sq" id="language-button" type="button" aria-haspopup="dialog"><svg class="icon" aria-hidden="true"><use href="#i-language"/></svg><span class="language-name" id="language-name">English</span><span class="language-code" id="language-code">EN</span><svg class="icon chevron" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>
<p class="scope-label" id="category-label">Category</p>
<div class="categories" id="categories"></div>
<div class="sidebar-foot" id="sidebar-foot"></div>
</nav>
<form class="search" id="searchform" role="search" novalidate>
<div class="search-field sq" id="search-field"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg><input id="query" type="text" dir="auto" inputmode="search" placeholder="Name or title" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" maxlength="200" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggestions" aria-label="Name or title"><kbd class="shortcut" aria-hidden="true">/</kbd><button type="button" class="clear-button sq" id="clear" aria-label="Clear search" hidden><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button></div>
<button class="search-submit sq" id="search" type="submit" aria-label="Search" disabled><svg class="icon" aria-hidden="true"><use href="#i-arrow-right"/></svg><span class="search-submit-label">Search</span></button>
</form>
<main class="main" id="main" tabindex="-1" aria-labelledby="results-title">
<div class="results-head" id="results-head" hidden><h2 class="results-title" id="results-title">Find an entry</h2><span class="count" id="count"></span></div>
<div class="progress" id="progress" hidden></div>
<div class="banner sq" id="banner" role="alert" hidden></div>
<div class="filter-bar" id="filter-bar" hidden><div class="chips" id="filters"></div></div>
<p class="notice" id="notice" role="status"></p>
<section class="results" id="results" aria-label="Search results" aria-busy="false"></section>
<div class="empty" id="empty"></div>
<footer class="results-foot" id="results-foot" hidden><button class="text-button sq" id="responses" type="button"><svg class="icon" aria-hidden="true"><use href="#i-data"/></svg><span>All returned data</span></button><p class="limits">Akinator limits how many matches it returns.</p></footer>
</main>
<div class="suggestion-panel sq" id="suggestion-panel" hidden><div class="suggestion-heading"><span id="suggestion-status" role="status">Suggestions</span><button class="icon-button small sq" id="dismiss" type="button" aria-label="Close suggestions"><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button></div><ul id="suggestions" role="listbox" aria-label="Suggestions"></ul></div>
<aside class="inspector" id="inspector" aria-label="Entry details"></aside>
</div>
<div class="sheet-layer" id="sheet-layer" hidden>
<div class="sheet-scrim" aria-hidden="true"></div>
<section class="sheet sq" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
<div class="sheet-grabber" aria-hidden="true"></div>
<header class="sheet-header"><button class="icon-button sq" id="sheet-back" type="button" aria-label="Back" hidden><svg class="icon" aria-hidden="true"><use href="#i-chevron-left"/></svg></button><h2 class="sheet-title" id="sheet-title"></h2><div class="sheet-actions" id="sheet-actions" hidden></div><button class="icon-button sq" id="sheet-close" type="button" aria-label="Close"><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button></header>
<div class="sheet-body" id="sheet-content"></div>
<div class="sheet-footer" id="sheet-footer" hidden></div>
</section>
</div>
<div class="toasts" id="toasts" aria-live="polite"></div>
</body>
</html>`;
