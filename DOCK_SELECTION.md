# Dock Selection

The dock is the control panel from step 2 of [Install](README.md#install). Printer Bot prints without it (see **Without the dock** in [The dock's settings](PRINTER_OPERATION.md#the-docks-settings)). Its page runs in your OBS and connects only to your Streamer.bot (the dock starts with `127.0.0.1`, this PC).

## The hosted dock

The hosted dock is the one in the install steps: `https://printer-bot.spore-ta-potty.com/`. The author serves it from Cloudflare. It suits a Streamer.bot on the same PC as OBS, because a plain `ws://` connection from an https page to another computer may be blocked.

## Host it yourself

Any static web server will do, because the dock is plain files. Download this repository as a ZIP (**Code → Download ZIP** on the repository's page) and unzip it. Then work through the points below.

- Upload `index.html`, `versions.json`, `css/`, `js/`, `vendor/`, `assets/`, `v/`, `core/`, `import.txt` and `import.prerelease.txt`, keeping the folders. Skip `README.md`, `PRINTER_OPERATION.md`, `PRIVACY.md`, `TROUBLESHOOTING.md`, `UPDATING.md`, `DOCK_SELECTION.md`, `LICENSE`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md`, `.gitignore` and `.gitattributes`. Skip `import.sha256.txt` and `import.prerelease.sha256.txt` as well, and keep those two on GitHub. The check in [Check your import](TROUBLESHOOTING.md#check-your-import-optional) then uses a fingerprint your web host cannot change.
- `index.html` is a small launcher. It asks the Printer Bot action for its version and opens the matching dock page. Dock pages for Printer Bot 2.3.0 and later live in folders under `v/`, and a folder named like `3.0.0-beta.1` is the dock page of a prerelease. The launcher picks the newest page that is not newer than the action, so a prerelease page reaches only an action that is that prerelease or newer. `versions.json` lists the dock pages, so upload it with the rest.
- Keep each `renderer.html` and its `renderer.html.sig` together, byte for byte. The signature covers the exact bytes, so if the web server or a CDN changes them (minifying, adding a script), the action refuses the layout and keeps its current one.
- The `core/` folder holds the program updates: `core/api1/manifest.json`, `core/api1/manifest.json.sig` and `core/api1/core-<version>.bin`. The prerelease has the same three files in `core/api1/prerelease/`. Keep each set of three together, byte for byte, for the same reason. Upload `core/` if you want Printer Bot to find program updates on your host. Without it the Updates card says "This dock host does not offer program updates." and everything else works. Printer Bot accepts only program updates the author signed, so a host cannot publish its own. Upload the `core/` folder from the ZIP again whenever you upload a newer release.
- Send `Cache-Control: no-cache` with every file (the NGINX sample below does). New versions then apply at once. The addresses of a dock page's files also carry a stamp that changes with the file, so even a browser that caches hard fetches a changed file.
- Allow framing from your own site. The launcher shows the dock page in a frame of the same web address, so send no `X-Frame-Options` header or `SAMEORIGIN`, and if you set `frame-ancestors`, include `'self'`. A server that forbids framing leaves the launcher on "The dock page did not load."
- Use HTTPS, which lets the dock use a Streamer.bot password (see [Lock the WebSocket server](TROUBLESHOOTING.md#lock-the-websocket-server-recommended)). Certificates are free, for example from Let's Encrypt.
- A minimal NGINX server block:

  ```nginx
  server {
      listen 443 ssl;
      server_name dock.example.com;
      # ssl_certificate and ssl_certificate_key go here

      root /var/www/printer-bot-dock;
      index index.html;

      add_header Cache-Control "no-cache" always;
      add_header X-Content-Type-Options "nosniff" always;   # add_header lines inside a location replace these: keep them all here

      location / {
          try_files $uri $uri/ =404;
      }
  }
  ```

- To try it without a web server (this needs Python), run `python -m http.server 8090 --bind 127.0.0.1` in the folder with `index.html` and use `http://127.0.0.1:8090/` as the dock's address. It works while that window stays open. Pick a port other than Streamer.bot's WebSocket port. A `file:///` address does not work, because the dock needs a web address.

## How updates find your dock

- The update source is the web folder of the dock page that connected first (`v/2.5.0/` for the current release). The action checks it each time the dock connects. A new layout arrives only if that folder holds the new `renderer.html`, `renderer.html.sig` and `version.json`, so upload all three together (an old `version.json` hides a new layout). When you switch docks, press **Use this dock** in the new one.
- Program updates come from `core/api1/` at the top of the same site. Printer Bot takes the update source, drops a trailing `v/<version>/` and adds `core/api1/`. So `https://dock.example.com/printer-bot/v/2.4.0/` and `https://dock.example.com/printer-bot/` both lead to `https://dock.example.com/printer-bot/core/api1/`. The prerelease is read from `prerelease/` inside that folder, and only when the person switched **Try prerelease versions** on.
- The dock recognises itself as the update source by host name and port. From version 2.3.0 the action follows a dock to another folder on the same host (for example when a new dock version arrives in its own folder under `v/`). A move from `http` to `https` on the same host goes unnoticed: the dock still says it is the update source while the action keeps the old address. With Streamer.bot closed, set `rendererUrl` in `settings.json` (see **Without the dock** in [The dock's settings](PRINTER_OPERATION.md#the-docks-settings)) to the new folder address.

## Trust

A dock host serves code that runs in your OBS and connects to your Streamer.bot. Trusting it takes the same trust as importing the action, and the code can do more than the Printer Bot commands, because Streamer.bot's WebSocket allows more. The author's signature covers layouts and program updates. The dock's code is outside it, and the SHA-256 check covers the import text only. The fingerprint the dock shows after **Copy import code** comes from the dock itself, so it helps only if you trust the host.

Use a host you trust, host the dock yourself, or import the code from this repository (see [Install](README.md#install)) and skip **Copy import code**. Keep WebSocket authentication, the password and **Enforce** on (see [Lock the WebSocket server](TROUBLESHOOTING.md#lock-the-websocket-server-recommended)).
