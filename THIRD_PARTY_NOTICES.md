# Third-party material

Printer Bot's own files are under the MIT licence (see [LICENSE](LICENSE)). The items below are **not** covered by it, or carry licences of their own.

## In this repository

| What | Where | Licence / status |
|---|---|---|
| `@streamerbot/client` 2.0.x (browser build), Streamer.bot's own client library | `vendor/streamerbot-client.js` | MIT, (c) 2023 Streamer.bot. Full text: `vendor/LICENSE-streamerbot-client.txt`. The file also contains a small helper function marked `@babel/helpers` (Babel, MIT) that was inlined when the library was bundled |
| Twitch, YouTube and Kick logos | embedded inside `renderer.html` and inside `import.txt`; there are no separate image files for them in this repository | **Trademarks of their owners**, used only to say which platform an event came from, and printed in black on the receipt. Not covered by this project's licence |
| `assets/logo.png` | the dock's header picture and tab icon | The SassyTP brand image. **Not** covered by the MIT licence: all rights reserved by its owner |
| `assets/icons/*.svg` | the dock's connection and status icons | Drawn for this project, MIT |

The name **SassyTP** (the author's name in the import, the `SassyTP` data folder, the dock's tab title and header picture) is not licensed for use as the name of someone else's product.

## Used, but not included

| What | How it is used | Licence |
|---|---|---|
| Newtonsoft.Json | Streamer.bot provides it to the action at run time. It is not part of this repository | MIT |
| Segoe UI | Named first in the receipt layout's font list (`renderer.html`). Windows already has it. Helvetica Neue, Helvetica and Arial follow as stand-ins | Part of Windows / your system |
| Inter | Named first in the dock's style sheet (`css/dock.css`) and used only if it is already installed on the viewer's computer. `system-ui` and a generic sans-serif follow. The dock also uses the generic monospace font | Not included |
| Microsoft Edge, the Windows print spooler | Edge draws the receipts, and the print spooler takes them to the printer | Their own licences, and neither is included |
| Streamer.bot, OBS | Printer Bot runs as an action inside Streamer.bot, and its dock is shown in OBS | Their own licences, and neither is included |

## Web services contacted at run time

The receipt page may contact only the hosts below. Both the page's own policy and the hidden Edge are limited to this list. The hosts are not part of this project, and their own terms apply. What is sent to them is described in the README under *Privacy and third-party services*.

| Host | What for |
|---|---|
| `decapi.me` | Twitch profile-picture lookups (a viewer's login name is sent) |
| `kick.com` | Kick profile-picture lookups (a viewer's login name is sent), and Kick's default profile pictures |
| `static-cdn.jtvnw.net` | Twitch profile pictures and emotes |
| `files.kick.com` | Kick profile pictures, gift pictures and emotes |
| `*.ggpht.com`, `*.googleusercontent.com`, `*.ytimg.com` | YouTube and Google profile pictures |
| `cdn.betterttv.net` | BetterTTV emotes |
| `cdn.7tv.app` | 7TV emotes |
| `cdn.frankerfacez.com` | FrankerFaceZ emotes |

Besides these, the action contacts the web address the dock is served from (see *Which dock?* in the README) to look for signed receipt-layout updates, and the dock page itself is loaded from its host. For the hosted dock that is the author's Cloudflare site. The host is not part of this repository.

## Not affiliated

Printer Bot is an independent project. It is not affiliated with, endorsed by or sponsored by Streamer.bot, Twitch, YouTube, Kick, StreamElements, Streamlabs, Fourthwall, OBS Project, Microsoft, BetterTTV, 7TV, FrankerFaceZ, decapi.me, RONGTA, Epson, Star Micronics or Xprinter. All product names and logos are the property of their owners.
