# Printer Bot

Printer Bot, by SassyTP, is a Streamer.bot action that prints a receipt on a thermal printer when something happens on your stream. It supports Twitch, YouTube, Kick, StreamElements, Streamlabs and Fourthwall.

For each event it draws the receipt in a hidden Microsoft Edge window, turns it into a black-and-white picture and sends it to your printer. A control panel, the **dock**, sits in OBS. Printing works with OBS closed.

**Credit.** Printer Bot was inspired by nutty's printer-bot. It is a separate project with its own code and its own way of working. This project uses no code from nutty's printer-bot.

**Status.** Printer Bot has run live on stream with Streamer.bot, OBS and a RONGTA RP332 thermal printer. To test without spending paper, set **Output** to *Preview only* (in the dock, or see *Without the dock*).

## LLM disclosure

1. LLM Disclosure: Yes
2. LLM Disclosure Information: Claude Sonnet 5.5 was used in the creation of this code, with work specifically focused on documentation, as well as security and performance optimizations.

## Requirements

- **Windows 10 or 11** (developed and tested on Windows 11) and **Microsoft Edge**, which comes with Windows.
- **Streamer.bot 1.0.x.** The dock also needs Streamer.bot's WebSocket server, which a fresh install starts by itself.
- **A receipt printer installed in Windows**, with its driver. Printer Bot is built for ESC/POS thermal printers (the command language most receipt printers understand). *Output* lists the other modes.
- **OBS**, for the dock. Printer Bot prints without it.

## Install

Most people need only the two steps below. Everything after them is optional.

1. **Import the code into Streamer.bot.**
   - **Download.** Choose **Code → Download ZIP** on this repository's page and unzip it. Put the folder with `import.txt` in it in your Streamer.bot folder, next to `Streamer.bot.exe`.
   - **Paste.** Open `import.txt` in Notepad, press Ctrl+A, then Ctrl+C. In Streamer.bot click **Import** (top bar), paste, and click **Import**. A new action called **Printer Bot** appears in a group called **SassyTP**.

   An import runs code inside Streamer.bot with your rights, so import only text from this repository.

2. **Add the dock to OBS.** In OBS choose **Docks → Custom Browser Docks**, enter a name (for example `Printer Bot`) and the address `https://printer-bot.spore-ta-potty.com/`, then click **Apply**. The dock connects to the Streamer.bot on your PC by itself. Under **Printer** pick your receipt printer (Auto-detect is only a guess). Under **Test**, pick a sample and press **Test print**. A sample receipt comes out, or is saved as a picture in *Preview only* mode. **Show last receipt** shows what was sent to the printer.

That's all. Printer Bot prints a receipt for every event listed under *What prints*. Channel point rewards stay off until you switch them on (see below).

### If the dock doesn't connect

- Streamer.bot has to be running with its WebSocket server on (**Servers/Clients → WebSocket Server**, with **Auto Start** ticked). A fresh install has it set up that way, on `127.0.0.1` and port 8080.
- If the dock shows a **Streamer.bot** window, enter `127.0.0.1`, the port from the WebSocket Server settings and your password if you set one, then click **Connect**. The dock keeps these in its browser, so OBS reconnects after a restart. Untick **Remember on this computer** to skip storing the password. The round icon at the top right (green tick: connected, red cross: not) reopens the connect window.
- If the dock says **Set up Streamer.bot**, it can't find the action. Import `import.txt` as in step 1, or click **Copy import code** and import that (see **Trust** under *Which dock?*). Then click **Check again**.
- Other causes are under *Troubleshooting*.

### Channel point rewards

Channel point rewards are off by default, so a run of redemptions can't use up your paper. To print them, open the **Printer Bot** action in Streamer.bot, switch on its **Channel Reward** trigger (under Twitch) and choose the reward it should react to. A trigger with no reward chosen reacts to every reward. Give the reward a cooldown and a per-stream limit in Twitch. Printer Bot also skips free receipts beyond 30 a minute (see **Free receipts per minute**).

### Lock the WebSocket server (recommended)

In Streamer.bot open **Servers/Clients → WebSocket Server**, switch on **Authentication**, set a **Password** and tick **Enforce**. Then enter the password in the dock's **Streamer.bot** window. Without all three, any program or overlay on your PC can send Printer Bot commands. Without Enforce, Streamer.bot asks for the password only for some requests. The dock can use the password only over `https://` or from this PC (`127.0.0.1` or `localhost`).

### Check your import (optional)

`import.sha256.txt` holds the SHA-256 fingerprint of `import.txt`. In PowerShell type `Get-FileHash -Algorithm SHA256 ` (with a trailing space), drag `import.txt` into the window and press Enter. The printed **Hash** must equal the first value in `import.sha256.txt` (case doesn't matter). If it differs, don't import. Download the ZIP again and, if it still differs, report it as described in [SECURITY.md](SECURITY.md).

### Updating

- A new version is a new `import.txt` in this repository. Download the ZIP again and replace the folder, delete the old **Printer Bot** action in Streamer.bot and import the new `import.txt` as in step 1. An import creates the triggers again, so switch **Channel Reward** on again if you use it. Your settings stay in their own folder, and the first receipt after an upgrade can take a second longer. If you host your own dock, upload its files again too.
- If you used the two-action version before 2.0 (actions named *Printer Bot | Events* and *Printer Bot | Print Routine*), disable or delete both.

## Which dock?

The dock is the control panel from step 2. Printer Bot prints without it (see *Without the dock*). Its page runs in your OBS and connects only to your Streamer.bot (the dock starts with `127.0.0.1`, this PC).

**The hosted dock** is the one in the install steps: `https://printer-bot.spore-ta-potty.com/`. The author serves it from Cloudflare. It suits a Streamer.bot on the same PC as OBS, because a plain `ws://` connection from an https page to another computer may be blocked.

**Host it yourself.** Any static web server will do, because the dock is plain files.

- Upload `index.html`, `css/`, `js/`, `vendor/`, `assets/`, `config.json`, `import.txt`, `renderer.html`, `renderer.html.sig` and `version.json`, keeping the folders. You can skip `README.md`, `LICENSE`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md`, `.gitignore` and `.gitattributes`. Do **not** upload `import.sha256.txt`. Keep that one from GitHub, so the check under *Check your import* uses a fingerprint your web host can't change.
- Keep `renderer.html` and `renderer.html.sig` together, byte for byte. The signature covers the exact bytes, so if the web server or a CDN changes them (minifying, adding a script), the action refuses the layout and keeps its current one.
- Send `Cache-Control: no-cache` with every file (the NGINX sample below does). New versions then apply at once, and `index.html` never runs against an older `js/app.js` or `css/dock.css`.
- Use HTTPS, which lets the dock use a Streamer.bot password (see *Lock the WebSocket server*). Certificates are free, for example from Let's Encrypt.
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

- To try it without a web server (this needs Python), run `python -m http.server 8090 --bind 127.0.0.1` in the folder with `index.html` and use `http://127.0.0.1:8090/` as the dock's address. It works only while that window stays open. Pick a port other than Streamer.bot's WebSocket port. A `file:///` address doesn't work, because the dock needs a web address.
- The update source is the web folder the first connected dock was served from. The action checks it each time the dock connects. A new layout arrives only if that folder holds the new `renderer.html`, `renderer.html.sig` and `version.json`, so upload all three together (an old `version.json` hides a new layout). When you switch docks, press **Use this dock** in the new one.
- The dock recognises itself as the update source by host name and port only. If you move your dock to another folder, or from `http` to `https`, on the same host, it still says it is the update source while the action keeps the old address. With Streamer.bot closed, set `rendererUrl` in `settings.json` (see *Without the dock*) to the new folder address.

**Trust.** A dock host serves code that runs in your OBS and connects to your Streamer.bot. That takes the same trust as importing the action, and the code can do more than the Printer Bot commands, because Streamer.bot's WebSocket allows more. The author's signature doesn't cover the dock's code, and the SHA-256 check covers only the import text. The fingerprint the dock shows after **Copy import code** comes from the dock itself, so it helps only if you trust the host. Use a host you trust, host the dock yourself, or import `import.txt` from your own download and skip **Copy import code**. Keep WebSocket authentication, the password and **Enforce** on (see *Lock the WebSocket server*).

## Using Printer Bot

### What prints

Every event below has a trigger in the action. All of them are switched on, except channel point rewards. Switch off any you don't want in the action's trigger list.

| Platform | Receipts for |
|---|---|
| Twitch | cheers (bits), channel-point rewards (off until you switch the trigger on), subscriptions, resubscriptions, gifted subs (a gift bomb prints one receipt that lists every recipient, up to 200), raids of 5 or more viewers (the Raid trigger's minimum, which you can change in the trigger list) |
| YouTube | new members, member milestones, gifted memberships (the gifter's and each recipient's), Super Chats, Super Stickers |
| Kick | subscriptions, resubscriptions, gifted subscriptions (single and mass), raids, gifted Kicks (only gifts of type LEVEL_UP). Streamer.bot has to be logged in to Kick for any of these (see *Troubleshooting*) |
| StreamElements | tips |
| Streamlabs | donations |
| Fourthwall | donations, orders (with a total above zero), memberships |

Kick raids and gifted Kicks arrive through two Streamer.bot *custom code event* triggers, `[Kick.bot] Raid` (event name `kickIncomingRaid`) and `[Kick.bot] Kicks gifted` (event name `kickKicksGifted`). They fire only if a Kick integration or your own script in Streamer.bot raises those events. The **Streamer.bot Started** trigger only warms up the receipt browser. Leave it on.

Each printed (or saved) receipt raises a Streamer.bot custom trigger called **Print Job Sent** (category SassyTP → Printer Bot) that other actions can react to.

### Output

| Output | For |
|---|---|
| Thermal printer (ESC/POS) | most receipt printers, and the fastest |
| Windows printer driver | printers that don't speak ESC/POS. Uses the printer's normal driver and is slower |
| Preview only (no printer) | trying it without a printer. Receipts are saved as PNG pictures (the newest 50 are kept) |

### The dock's settings

| Setting | What it does (default) |
|---|---|
| **Printer** | The Windows printer to use. **Auto-detect** guesses from the printer names. Hidden in *Preview only* mode. |
| **Paper width** | **80 mm** (default) or **58 mm**, printed 72 mm or 48 mm wide. |
| **Output** | See above. Default: Thermal printer (ESC/POS). |
| **Picture style** | How avatars become black and white: **Detailed** (default), **Soft** or **Crisp (no shading)**. |
| **Paper cut** | **Partial** (default), **Full** or **None**. Thermal (ESC/POS) only. |
| **Extra feed before cut** | Extra paper before the cut, in printer dots, 0 to 400 (default 80, about 10 mm). Thermal (ESC/POS) only. |
| **High Roller (bits)** | Cheers of at least this many bits may style their message. Default 25, and 0 means plain text for everyone. |
| **Ignore test triggers** | Skips "Test" and "Simulate" events from Streamer.bot. Off by default. |
| **Keep debug files** | Saves the last event and receipt picture in the data folder. Off by default. |
| **Advanced → High Roller: bits per inch** | Caps the printed length of a High Roller message. Default 0, no limit. |
| **Advanced → Hide links in messages** | Replaces text that looks like a web address in a normal message with [link] (not every bare domain name is caught). High Roller messages are untouched. Off by default. |
| **Advanced → Free receipts per minute** | Stops a flood of free prints. Only channel-point redemptions and raids count, never cheers, subs, gifts or tips. Default 30, and 0 means no limit. A warning is logged at most every 30 seconds, and the dock shows the count ("Skipped by that limit"). |
| **Advanced → Renderer updates** | Where Printer Bot looks for layout updates, normally this dock. **Check now** looks at once. **Use this dock** switches to this dock's address. |
| **Advanced → Download renderer updates** | On by default, so Printer Bot fetches newer receipt layouts, signed by the author, from the update source. Off means the built-in layout is always used. If you never open the dock, nothing is downloaded. |
| **Advanced → Renderer** | Shows the layout version. **Reset to built-in renderer** drops a downloaded layout. |

The dock calls the receipt layout the "renderer".

**Without the dock.** Printer Bot works with the defaults above (Thermal printer output, Auto-detect, 80 mm). If Auto-detect doesn't find your printer, or you want another setting, edit `settings.json` in the data folder. In the dock's words:

- `mode` `escpos` is *Thermal printer (ESC/POS)*, `windows` is *Windows printer driver* and `png` is *Preview only*.
- `dither` `floyd` is *Detailed*, `atkinson` is *Soft* and `threshold` is *Crisp (no shading)*.
- `cut` is `partial`, `full` or `none`, `paperWidthMm` is 80 or 58 and `printer` is the exact Windows printer name.
- `allowHostedUpdates` (`true` or `false`) is *Advanced → Download renderer updates*.
- The other keys are `feedDots`, `highRollerBits`, `highRollerBitsPerInch`, `freePrintsPerMinute`, `hideLinks`, `ignoreTestTriggers` and `keepDebugFiles`.

`rendererUrl` holds where layout updates come from. Leave it alone, except as described under *Which dock?*. It must be the dock folder's full address ending with `/`, for example `https://dock.example.com/printer-bot/`, or the last part is taken for a file name and dropped. An unusable value is cleared, and the next dock that connects sets it again.

Close Streamer.bot before editing the file. Printer Bot reads it only at startup, and an edit made while it runs is lost if the dock saves a setting first.

**Auto-detect** guesses from printer names. In thermal (ESC/POS) mode it accepts only receipt-looking names (receipt, thermal, RONGTA, Epson TM, Star, Xprinter, POS), because raw printer commands sent to an office printer print pages of garbage. In the other modes it skips virtual printers (PDF, XPS, Fax, OneNote) and prefers a receipt-looking name. A printer you pick is used as long as it's installed, so pick a receipt printer.

**Test print** offers fourteen samples for Twitch, YouTube and Kick. **TwitchCheerLong** (60 lines, a lot of paper) is a 100-bit cheer, or as many bits as your High Roller threshold if that's higher, for trying out *bits per inch*. With the threshold at 0 it prints as plain text. **TwitchGiftBomb** lists 50 recipients, one to a line (about 40 cm of paper). Streamer.bot's own Test button sends sparse events, for example a gift bomb with no names and a YouTube member with no level name, so use these samples to see a full receipt.

### What viewers can put on a receipt

- Normal messages print as plain text, so markup shows up literally. They are cut at 500 characters and aren't moderated. Twitch AutoMod and Streamer.bot's own filters are the only filters.
- A cheer of at least the **High Roller (bits)** threshold may style its message with HTML: bold, colours, sizes, rotated text, tables, and Twitch, Kick, BTTV, 7TV and FFZ emotes. Always removed, High Roller or not: clickable links, scripts, event handlers, forms, frames, `<style>`, `<link>`, `<meta>`, SVG, CSS that loads anything, and images from any other site. A web address typed as plain text still prints as text. Allowed HTML can still look ugly or obnoxious, so set the threshold as high as you're comfortable with.
- A High Roller message is cut at 4000 characters of HTML and 400 elements or pieces of text. Its pictures are limited to 64 pixels (about 17 mm). A receipt can never be longer than about 1.3 m of paper. Names are cleaned of invisible and text-direction characters and cut at 48 characters.
- *Bits per inch* limits a High Roller message to *bits ÷ this number* inches. At `10`, a 100-bit cheer gets up to 10 inches and a 25-bit cheer up to 2.5 (decimals such as `2.5` work, and `0` means no limit of its own). Longer messages fade out at the limit, and the Streamer.bot log notes how much was cut. Avatars, names, logos, dates and normal messages are never limited. No message prints longer than about 16.7 inches whatever the setting.
- A Fourthwall order or donation that arrives without a user name prints **Anonymous supporter** and never shows the buyer's e-mail address.

When something that matters is removed from a message, the Streamer.bot log says who sent it.

### Keeping an eye on the printer

Before each receipt, the action asks Windows whether the print queue can print and whether jobs are stuck. The dock's **Print queue** row shows the answer, and the Streamer.bot log reports it once per change when the queue shows an error or stuck jobs.

A printer that's off or unplugged should print an accepted job when it comes back. Windows reports only what the driver tells it, so with some drivers it can't see that the paper has run out.

If no printer can be found or opened, or the spooler isn't running, the receipt is logged as "Print failed", shown in the dock and not retried.

If the printer you chose was removed or renamed, Printer Bot warns in the Streamer.bot log and the dock's **Note** row, then prints on whichever printer Auto-detect picks (in *Windows printer driver* mode, any non-virtual printer). The **Note** row also says when no receipt printer was found. Check it if receipts come out in the wrong place.

### How receipts look, and theme.css

Receipts use one typeface (Segoe UI) in two weights: bold for titles, names and amounts, regular for the rest. Only High Roller messages can use italics. Everything is pure black on white, with a black Twitch, YouTube or Kick logo at the bottom where the platform has one and a short date in your computer's language and 12/24-hour style. The profile picture is 390 dots (about 49 mm) wide on 80 mm paper, at the very top, and shrinks on narrower paper.

To change the look, put CSS in `theme.css` in the data folder (the dock's **Customize** card shows the folder, relative to your Streamer.bot folder, and has a **Copy folder path** button). It applies on the next print with no restart. For example:

```css
#receipt-icon { height: 2em; }       /* smaller platform logo */
#receipt-icon { display: none; }     /* no platform logo */
#receipt-avatar { display: none; }   /* no profile picture (this leaves no margin above the first line: add #receipt-container { padding-top: 16px; } if you want it) */
```

You can style `#receipt-container`, `#receipt-avatar`, `#receipt-title` (with `.big` for amounts), `#receipt-subtitle`, `#receipt-content` (its blocks have class `.part`), `#receipt-icon` and `#receipt-date`. A receipt without a picture has `.no-avatar` on `#receipt-container`. On 80 mm paper the receipt page is 272 pixels wide (181 on 58 mm paper).

**Avoid `vh` units, `height: 100%` and `min-height: 100vh`.** The receipt is laid out in a window that is always 5,000 pixels tall, so those make every receipt about 1.3 m long.

### Where Printer Bot keeps its files

The first time it runs, Printer Bot creates its own data folder, `<Streamer.bot>\SassyTP\printer-bot\` (`<Streamer.bot>` is your Streamer.bot folder), and keeps what it writes there.

| File or folder | What it is |
|---|---|
| `settings.json` | your settings (made by Printer Bot, changed from the dock or by hand) |
| `theme.css` | optional, yours: restyles receipts |
| `receipts\` | the pictures saved in *Preview only* mode |
| `avatars.json` | remembered profile-picture addresses (viewer names and picture addresses) |
| `renderer.html`, `renderer.html.sig` | a downloaded receipt layout and its signature, once verified and used |
| `renderer.rejected` | the number of a downloaded layout that wouldn't start |
| `settings.json.bad` | a copy of an unreadable `settings.json` (Printer Bot then uses the defaults) |
| `last_event.json`, `last_receipt.png` | only with **Keep debug files** on (they contain viewer names and messages) |

The hidden Edge keeps its own profile in `%LOCALAPPDATA%\SassyTP\printer-bot\edge-cdp-profile-v3`. An Edge process with no window in Task Manager is Printer Bot's receipt browser. It may outlive Streamer.bot, and it's safe to end because Printer Bot starts a new one when needed.

## Troubleshooting

The dock's status line and the Streamer.bot log (lines starting with `[Printer Bot]`) usually say what's wrong.

- **Nothing prints.** Check in order:
  - **Output** is set to *Preview only*.
  - The action is disabled (the dock then says "Streamer.bot did not answer. Is the Printer Bot action enabled?").
  - **Ignore test triggers** is on and the event is a Test or Simulate.
  - **Free receipts per minute** was reached ("Skipped by that limit").
  - The Channel Reward trigger is still off (the default) or is set to a different reward.
  - The printer is off or disconnected (stuck jobs show as "3 receipts waiting in the queue, the oldest for 5 min. Is the printer connected and on?").
- **"No printer found. Install your receipt printer, or pick one below."** (the log says "...or choose one in the dock."). Install the printer in Windows, then pick it in the dock's **Printer** list or set `printer` in `settings.json`.
- **It prints on the wrong printer, or pages of strange characters come out.** Choose the printer yourself and don't rely on Auto-detect. If it doesn't speak ESC/POS, set **Output** to *Windows printer driver*.
- **The last line is clipped by the cutter.** Raise **Extra feed before cut**.
- **"Can't start Edge: ..."** Install or repair Microsoft Edge (it comes with Windows 10 and 11), then press **Test print** again.
- **The dock cannot connect.** Check that Streamer.bot is running with its WebSocket Server started, and that the port and password match. The connect window warns when the dock loads over plain http.
- **The dock cannot connect and the page is on https.**
  - Chrome and Edge 147 and later ask once per site whether it may connect to devices on your computer or local network (**Apps on device** in Chrome, worded a little differently elsewhere). Choose **Allow**. If you blocked it, change it under **Site settings**, from the icon at the left end of the address bar.
  - The browser built into OBS 32 (Chromium 127 in OBS 32.2.2) is older and doesn't ask. It isn't known yet whether a later OBS will ask or refuse silently.
  - In Chrome and Edge 147 and later, a plain-`http` dock from the internet can't reach Streamer.bot on your PC at all, and no question is asked.
- **"The Printer Bot action in Streamer.bot is older than this dock, so some settings below are switched off."** Delete the old action and import the current `import.txt` or use **Copy import code** (see **Trust** under *Which dock?*). Then switch Channel Reward on again if you use it, and reload the dock.
- **"Updates come from: another address: ..."** The action remembers the first dock it met, so this appears after a dock moves to another host name or port. **Advanced → Renderer updates** shows the old address. To use this dock, press **Use this dock**, then press it again within 5 seconds when it asks "Are you sure? Click again".
- **The dock's Renderer row says "refused: ..." or "update check failed" (a dock you host yourself).** Printer Bot keeps its current layout. Upload `renderer.html`, `renderer.html.sig` and `version.json` again from the same ZIP, unchanged, and make sure no web server or CDN alters them (see *Which dock?*). If you moved your dock to another folder on the same host, see the update source bullet there.
- **A receipt is blank or looks wrong after you added `theme.css`.** Move `theme.css` out of the folder and print again.
- **Receipts are very long.** Check `theme.css` for `vh`, `height: 100%` or `min-height: 100vh`. For a long cheer message, set **High Roller: bits per inch**.
- **One receipt took longer than the others.** The Streamer.bot log line for each receipt lists its time in parts that add up to **TOTAL**. After a quiet spell Streamer.bot unloads the action's code and loads it again for the next event. Printer Bot then warms up first, and that receipt waits for it. The line shows `Wait: ... (warm-up)`, usually under a second.
- **Nothing from Kick prints, not even a test from Streamer.bot.** Streamer.bot has to be logged in to Kick first. Its log (lines that start with `KickService` or `TokenManager`) says "Kick Broadcaster requested an access token, but no credentials exist" when it isn't. Log in your Kick broadcaster account in Streamer.bot's Kick settings, then try again.
- **A test from Streamer.bot prints a bare receipt.** Streamer.bot's own Test button sends sparse events. A gift bomb comes without names and a YouTube member without a level name. Real events carry that data. The dock's **Test print** samples show a full receipt (see *Test print*).
- **An event did not print.** Some events are skipped on purpose with no log line. These are single gifted subs inside a gift bomb, Kicks gifts that aren't of type LEVEL_UP, Fourthwall orders with a total of zero and Twitch raids below the Raid trigger's minimum (5). Free events over the limit log "More than N free receipts ... the extra ones are skipped". "Nothing printed for ..." appears only for an event type Printer Bot has no layout for.

## Privacy and third-party services

Printer Bot has no telemetry or analytics. Your settings, `avatars.json` and, with **Keep debug files** on, `last_event.json` and `last_receipt.png` never leave your PC. The action and the dock in this repository send no settings, receipts or usage data to the dock's host or anyone else. Drawing a receipt uses a few public services:

- **decapi.me** (Twitch) and **kick.com** (Kick) receive a viewer's login name to look up the address of their profile picture, which is remembered in `avatars.json`. Donor and buyer names on StreamElements, Streamlabs and Fourthwall are looked up as Twitch names when they use only letters, digits and underscores (up to 25 characters). No setting switches these lookups off. Test prints of Twitch or Kick samples look up the public profile picture of SassyTP.
- **Image hosts** (Twitch, Kick, YouTube and Google profile pictures, BetterTTV, 7TV, FrankerFaceZ) see an image request from your PC when they serve profile pictures and emotes. The exact list is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **The dock's web host** is the author's Cloudflare site for the hosted dock and your own server for a dock you host. It sees requests for the dock files and for update checks (a version file, then the layout and signature if something newer exists). Those requests say they come from Printer Bot and which version, and the host sees your internet address. The author's Cloudflare site counts requests to the hosted dock and may log the path, the status, the country and the first part of the user agent. The dock in this repository never sends it your Streamer.bot address, port or password, which stay in your browser (a modified dock could, see **Trust** under *Which dock?*).

## How it is protected

- The receipt page runs under a strict policy, and the hidden Edge can look up only the few web hosts listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Every other name fails to resolve, so even a taken-over receipt page couldn't reach other programs on your PC or home network.
- A downloaded layout is used only if it carries the author's signature, is newer than the current one and starts. The signature shows who published a layout. It doesn't show that the layout is safe, and it covers only the layout download.
- Through Streamer.bot's WebSocket, the dock can only change the settings above, request sample prints from a fixed list (at most 20 a minute) and read the status and last receipt. It can also check for or reset the layout and set where updates come from. That last setting is free the first time and later changes only on the dock's "Use this dock" request, which the action can't tell from anyone else's. None of this can make Printer Bot run code that you didn't import or that the author didn't sign.
- Anyone who can reach an unprotected Streamer.bot WebSocket can use that same channel to waste paper, send receipts to *Preview only*, switch update checks off, change where updates come from and read the status and last receipt picture. That picture shows a viewer's name and message (see *Lock the WebSocket server*).

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## What is in this folder

| File | What it is |
|---|---|
| `README.md`, `LICENSE`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md` | this guide, the licence, security reporting and third-party notices |
| `import.txt` | **the Streamer.bot import code**, the one file you need to install Printer Bot |
| `import.sha256.txt` | the SHA-256 fingerprint of `import.txt`, for the optional check under *Check your import* |
| `index.html`, `css/dock.css`, `js/app.js` | the dock web page |
| `config.json` | tells the dock which Printer Bot action to look for and the oldest action version it accepts |
| `vendor/streamerbot-client.js`, `vendor/LICENSE-streamerbot-client.txt` | Streamer.bot's own client library for the dock (MIT licence, notice included) |
| `assets/logo.png`, `assets/icons/*.svg` | the dock's header picture and connection icons |
| `renderer.html`, `renderer.html.sig`, `version.json` | the receipt layout, the author's signature over it, and a small file naming the current layout version (served by the dock's host for signed updates) |
| `.gitignore`, `.gitattributes` | repository settings |

## Licence

Everything in this repository is under the **MIT licence** ([LICENSE](LICENSE)), except:

- the Twitch, YouTube and Kick logos, which are trademarks of their owners and are used only to say which platform an event came from
- `assets/logo.png` and the **SassyTP** name, which aren't licensed for reuse
- third-party material, which keeps its own licence (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md))

Printer Bot is an independent project. It isn't affiliated with, endorsed by or sponsored by Streamer.bot, Twitch, YouTube, Kick, StreamElements, Streamlabs, Fourthwall, OBS Project, Microsoft, BetterTTV, 7TV, FrankerFaceZ, decapi.me or any printer maker.
