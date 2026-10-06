# Printer Bot

Printer Bot, by SassyTP, is a Streamer.bot action that prints a receipt on a thermal printer when something happens on your stream. It supports Twitch, YouTube, Kick, StreamElements, Streamlabs and Fourthwall.

For each event it draws the receipt in a hidden Microsoft Edge window, turns it into a black-and-white picture and sends it to your printer. A control panel, the **dock**, sits in OBS. Printing works with OBS closed.

**Credit.** Printer Bot was inspired by nutty's printer-bot. It is a separate project with its own code and its own way of working. This project uses no code from nutty's printer-bot.

**Status.** Printer Bot has run live on stream with Streamer.bot, OBS and a RONGTA RP332 thermal printer. To test without spending paper, set **Output** to *Preview only* (in the dock, or see *Without the dock*).

## LLM disclosure

1. LLM Used: Yes
2. LLM Disclosure Information: Claude Sonnet 5.5 was used in the creation of this code, with work specifically focused on documentation, as well as security and performance optimizations.

## What is new in 2.4.0

1. **Updates from the dock.** Printer Bot can now replace its own program while Streamer.bot keeps running. Version 2.4.0 itself ships with updates paused, so the **Updates** card says "The author has paused updates." and nothing installs yet. When the author publishes the next version, the card says "Update available" and lists what changed. You press **Update** twice and it installs. You then no longer delete and import the action for every version.
2. **Automatic installs, if you want them.** **Install updates automatically** is off by default. Switch it on and updates install themselves while Printer Bot is idle.
3. **A way back.** **Go back to the previous version** and **Use the built-in version** undo an update with one click.
4. **Signed updates.** A program update runs only if the author signed it with a key that is built into your import. A dock host or anyone on the way to it cannot slip in something else.
5. **One more import for 2.2.1, 2.3.0 and 2.3.1.** Those versions can't update themselves. Import 2.4.0 once (see *Updating*). A bar above the dock tells you when that applies to you.
6. **The Edge fix stays.** Version 2.3.1 fixed a problem where the hidden browser could keep Streamer.bot's WebSocket port busy after Streamer.bot closed. Version 2.4.0 has the same fix.

Receipts, layouts and settings work as before. In the author's tests every sample receipt comes out the same as in 2.3.0.

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

`import.sha256.txt` holds the SHA-256 fingerprint of `import.txt`. In PowerShell type `Get-FileHash -Algorithm SHA256 ` (with a trailing space), drag `import.txt` into the window and press Enter. The printed **Hash** must equal the first value in `import.sha256.txt` (case doesn't matter). If it differs, don't import. Download the ZIP again and, if it still differs, report it as described in [SECURITY.md](SECURITY.md). The fingerprint covers the import only. A program update that the dock installs later has its own check, the author's signature (see *How it is protected*).

## Updating

What changed in each version is listed on this repository's **Releases** page. How a new version reaches you depends on the one you run now.

### From 2.2.1, 2.3.0 or 2.3.1: import once

Printer Bot 2.2.1, 2.3.0 and 2.3.1 can't replace their own program, so you import the new `import.txt` one time. Nothing stops working if you wait. Your current version keeps printing as it does today.

1. Download the ZIP again, as in step 1 of *Install*. If you would rather paste than download, open the dock and use **Show how** in the bar described below.
2. In Streamer.bot, delete the old **Printer Bot** action.
3. Import the new `import.txt` as in step 1. An import creates the triggers again, so switch **Channel Reward** on again if you use it.
4. Reload the dock.

Your settings stay in their own folder, and the first receipt after an import can take a second longer. If you host your own dock, upload its files again too (see *Which dock?*).

Until you import, the dock shows a bar above it that says: "Printer Bot 2.4.0 can update itself from this dock. Your Printer Bot is 2.3.0, so it needs one re-import first." (with your own version in the second sentence). **Show how** opens the newest dock page, which lists these steps and has a **Copy import code** button. **Hide** puts the bar away, and the dock remembers that in your browser. If OBS doesn't keep the dock's browser data, the bar comes back the next time the dock loads. The bar needs Streamer.bot to be running, because the dock reads your Printer Bot version from it.

### From 2.4.0 on: update from the dock

**Version 2.4.0 itself ships with updates paused.** Until the author publishes the next version, the card says "The author has paused updates." and offers no **Update** button. That is expected. Check back after the next release.

The dock has an **Updates** card between the status and the settings. It shows the version that runs ("2.4.0 (built in)", or "(downloaded)" after an update), the updater's number and when Printer Bot last checked.

- **How it checks.** Printer Bot asks the dock's web host whether a newer program exists. It asks:
  - when a dock connects (at most once every 15 minutes, and sooner when the update source changed),
  - about a minute after Printer Bot's code starts in Streamer.bot (skipped when the last check is less than six hours old),
  - every six hours after that,
  - when you press **Check now** (at most once every 20 seconds).

  It needs to know where updates come from, so open the dock from its web address once and let it connect. Until Printer Bot has asked once since its code started, the card says "Checking soon." It says the same after you switch **Download updates** on again, until the next check answers. When Streamer.bot loads Printer Bot's code again while the dock is open (it does that after a quiet spell), the card keeps what it showed until Printer Bot answers the dock the next time. If that answer says it has not checked yet, the card says "Checking soon." and the dock asks for a check by itself, at most once a minute. **Check now** asks at once.
- **Update available.** The card says "Update available: 2.4.1", lists "What's new" as the author wrote it, and shows **Update to 2.4.1**. A small blue dot also appears at the top of the dock, next to the connection icon. Clicking the dot jumps to the card.
- **Two clicks.** Press **Update to 2.4.1**. The button changes to "Update now? Click again". Press it again within 5 seconds. One click installs nothing. The second click names the version you saw. Printer Bot then asks the host for the signed list once more, so an install never rests on an old answer. If the author published a newer version in between, the card shows the new version and its notes and installs nothing. An update whose signing key was revoked by then is refused.
- **What you see.** The card goes through "Downloading 2.4.1…" with a percentage, "Checking the download of 2.4.1…", "Waiting for a receipt to finish…" (only if one is printing), "Switching to 2.4.1…" and "Updated to 2.4.1." Then the dock tells the launcher the new version. The launcher shows the matching dock page if there is another one. **Reload dock** does the same by hand.
- **A receipt that is printing.** An update never cuts a receipt off. It waits for the receipt to finish, 15 seconds at a time, tries again every 30 seconds and gives up after several minutes with "Printer Bot is busy with a receipt. Try again in a moment." A very long list, such as a huge gift bomb, can make it wait longer. Events that arrive while the new version starts wait for the switch and then print. The first receipt after an update can take a moment longer.
- **If it fails.** The old version keeps running. The card says "The update did not work." with the reason and "Nothing changed. The previous version keeps running." After a failure Printer Bot waits a minute before it tries again, and it allows three tries an hour. A click on **Update** inside that minute, or after the third try, starts nothing. The red box keeps the reason of the failure, and a short note under the button says "Printer Bot tried this a moment ago. Wait a minute, then try again." The note goes away by itself within about 15 seconds.
- **If a new version won't start.** Printer Bot sets it aside and goes back to the version that ran before, which is the built-in one when there is no other. The card says "The new version did not start, so the old one is running again. Printer Bot is running 2.4.0 (built in). Version 2.4.1 will not be tried again." (with your own version numbers). A version that was set aside gets no **Update** button and is not tried again on that PC. Later the card says "Update 2.4.1 was set aside." A version that only started too slowly is dropped, and you can press **Update** again. When Streamer.bot crashes before a new version has settled in, Printer Bot sets that version aside at the next start.
- **If a downloaded version stops working.** A downloaded version that raises three load errors in a minute (its own files are broken or a part is missing) is dropped. Printer Bot goes back to the built-in version. The card says "Printer Bot went back to the built-in version." in amber, with "Version 2.4.1 stopped working, so Printer Bot set it aside." That version is not tried again and gets no **Update** button.

### Install updates automatically

The switch **Install updates automatically** in the Updates card is off by default. With it on, Printer Bot installs an update by itself only when all of these hold:

- **Download updates (layouts and program updates)** in Advanced is on.
- It found a newer update that the author signed. The author can mark an update so that it always needs your click, and then it is never installed automatically.
- No event and no dock command reached Printer Bot for at least two minutes (the buttons of the Updates card do not count).
- Nothing was installed or tried in the last 24 hours.
- You didn't go back from that version, and you didn't pick the built-in version.

Right before it installs, Printer Bot checks once more that both switches are still on and that you have not gone back from that version or picked the built-in one. It writes one line in the Streamer.bot log, `[Printer Bot] Installing update 2.4.1 automatically (you switched this on in the dock).`, and the card shows "Installing automatically." and afterwards "Installed automatically at" the time. Without a dock, set `autoUpdateCore` to `true` in `settings.json` (see *Without the dock*).

### Going back

Under **More** in the Updates card:

- **Go back to the previous version** switches to the version that ran before your last update. With no earlier downloaded version it uses the built-in one and keeps it until you press Update.
- **Use the built-in version** switches to the program that came with your import. It stays on it, also after Streamer.bot restarts, until you press Update. Automatic installs wait meanwhile.

Both buttons work while a downloaded version runs. The card says "Switching versions…" while one of them works. A version you went back from is skipped by automatic installs. **Update** installs it if you want it. Going back waits at most 15 seconds for a receipt that is printing, so a receipt that is still printing then may be lost. A press within 30 seconds of the last go-back, or while an update installs, is turned away. The card then says "Printer Bot is busy with a receipt. Try again in a moment."

### A later change to the import

Most future updates arrive through the dock. A change to the loader (the small part of the import that checks and installs updates) needs a new import again. The dock tells you: the card says "This Printer Bot needs a one-time re-import to update." or, when your updates still work, "A newer updater needs a one-time re-import. Your settings stay." The steps are the same as above.

### The dock follows your version

The dock matches your Printer Bot version. The page you open in OBS first asks Streamer.bot which version of the action you run, then shows the dock made for that version. A new dock never reaches an action that can't use it, and an older action keeps the dock it came with until you import a new one. After importing a new action, reload the dock. If Streamer.bot is off when the dock opens, the launcher uses the version it saw last for up to 7 days, then shows the newest dock and lets that dock read the real version.

If you used the two-action version before 2.0 (actions named *Printer Bot | Events* and *Printer Bot | Print Routine*), disable or delete both.

## Which dock?

The dock is the control panel from step 2. Printer Bot prints without it (see *Without the dock*). Its page runs in your OBS and connects only to your Streamer.bot (the dock starts with `127.0.0.1`, this PC).

**The hosted dock** is the one in the install steps: `https://printer-bot.spore-ta-potty.com/`. The author serves it from Cloudflare. It suits a Streamer.bot on the same PC as OBS, because a plain `ws://` connection from an https page to another computer may be blocked.

**Host it yourself.** Any static web server will do, because the dock is plain files.

- Upload `index.html`, `dock-2.2.1.html`, `versions.json`, `css/`, `js/`, `vendor/`, `assets/`, `v/`, `core/`, `config.json`, `import.txt`, `renderer.html`, `renderer.html.sig` and `version.json`, keeping the folders. You can skip `README.md`, `LICENSE`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md`, `.gitignore` and `.gitattributes`. Do **not** upload `import.sha256.txt`. Keep that one from GitHub, so the check under *Check your import* uses a fingerprint your web host can't change.
- `index.html` is a small launcher. It asks the Printer Bot action for its version and opens the matching dock page. Dock pages for Printer Bot 2.3.0 and later live in folders under `v/`. `dock-2.2.1.html` and the other top-level dock files (`css/dock.css`, `js/app.js`, `config.json`, `renderer.html`, `renderer.html.sig`, `version.json`) belong to version 2.2.1 and older. Keep them as they are. `versions.json` lists the dock pages, so upload it with the rest.
- Keep each `renderer.html` and its `renderer.html.sig` together, byte for byte. The signature covers the exact bytes, so if the web server or a CDN changes them (minifying, adding a script), the action refuses the layout and keeps its current one.
- The `core/` folder holds the program updates: `core/api1/manifest.json`, `core/api1/manifest.json.sig` and `core/api1/core-<version>.bin`. Keep the three together, byte for byte, for the same reason. Upload `core/` if you want Printer Bot to find program updates on your host. Without it the Updates card says "This dock host does not offer program updates." and everything else works. You can't publish program updates of your own, because Printer Bot accepts only the ones the author signed. Upload the `core/` folder from the ZIP again whenever you upload a newer release.
- Send `Cache-Control: no-cache` with every file (the NGINX sample below does). New versions then apply at once. The addresses of a dock page's files also carry a stamp that changes with the file, so even a browser that caches hard fetches a changed file.
- Allow framing from your own site. The launcher shows the dock page in a frame of the same web address, so send no `X-Frame-Options` header or `SAMEORIGIN`, and if you set `frame-ancestors`, include `'self'`. A server that forbids framing leaves the launcher on "The dock page did not load."
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
- The update source is the web folder of the dock page that connected first (`v/2.4.0/` for the current version). The action checks it each time the dock connects. A new layout arrives only if that folder holds the new `renderer.html`, `renderer.html.sig` and `version.json`, so upload all three together (an old `version.json` hides a new layout). When you switch docks, press **Use this dock** in the new one.
- Program updates come from `core/api1/` at the top of the same site. Printer Bot takes the update source, drops a trailing `v/<version>/` and adds `core/api1/`. So `https://dock.example.com/printer-bot/v/2.4.0/` and `https://dock.example.com/printer-bot/` both lead to `https://dock.example.com/printer-bot/core/api1/`.
- The dock recognises itself as the update source by host name and port. From version 2.3.0 the action follows a dock to another folder on the same host (for example when a new dock version arrives in its own folder under `v/`). Moving from `http` to `https` on the same host is the one change the dock does not notice: it still says it is the update source while the action keeps the old address. With Streamer.bot closed, set `rendererUrl` in `settings.json` (see *Without the dock*) to the new folder address.

**Trust.** A dock host serves code that runs in your OBS and connects to your Streamer.bot. That takes the same trust as importing the action, and the code can do more than the Printer Bot commands, because Streamer.bot's WebSocket allows more. The author's signature doesn't cover the dock's code, and the SHA-256 check covers only the import text. The fingerprint the dock shows after **Copy import code** comes from the dock itself, so it helps only if you trust the host. Use a host you trust, host the dock yourself, or import `import.txt` from your own download and skip **Copy import code**. Keep WebSocket authentication, the password and **Enforce** on (see *Lock the WebSocket server*).

## Using Printer Bot

### What prints

Every event below has a trigger in the action. All of them are switched on, except channel point rewards. Switch off any you don't want in the action's trigger list.

| Platform | Receipts for |
|---|---|
| Twitch | cheers (bits), channel-point rewards (off until you switch the trigger on), subscriptions, resubscriptions, gifted subs (a gift bomb prints one receipt that lists every recipient, however many there are), raids of 5 or more viewers (the Raid trigger's minimum, which you can change in the trigger list) |
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
| **Advanced → High Roller: maximum length** | The longest a High Roller message can print, in inches (0 to 40). It overrides *bits per inch* and applies to cheers only. Default 0, which keeps the built-in limit of about 16.7 inches. |
| **Advanced → Hide links in messages** | Replaces text that looks like a web address in a normal message with [link] (not every bare domain name is caught). High Roller messages are untouched. Off by default. |
| **Advanced → Free receipts per minute** | Stops a flood of free prints. Only channel-point redemptions and raids count, never cheers, subs, gifts or tips. Default 30, and 0 means no limit. A warning is logged at most every 30 seconds, and the dock shows the count ("Skipped by that limit"). |
| **Advanced → Renderer updates** | Where Printer Bot looks for layout updates, normally this dock. Program updates look in the same place (see *Updating*). Its **Check now** looks for a new layout at once. The **Check now** in the Updates card looks for a new program. **Use this dock** switches to this dock's address. |
| **Advanced → Download updates (layouts and program updates)** | On by default, so Printer Bot fetches newer receipt layouts and program updates from the update source and uses them only if the author signed them. Off downloads nothing and uses the built-in layout, and the Updates card says "Updates are switched off in Advanced." A program update you installed earlier keeps running until you press **Use the built-in version**. Until a dock has connected once, no update source is stored and nothing is downloaded. |
| **Advanced → Renderer** | Shows the layout version. **Reset to built-in renderer** drops a downloaded layout. |
| **Updates → Install updates automatically** | Off by default. On lets Printer Bot install a program update by itself when it is idle (see *Updating*). The switch is greyed out while **Download updates** is off. |

The dock calls the receipt layout the "renderer".

**Without the dock.** Printer Bot works with the defaults above (Thermal printer output, Auto-detect, 80 mm). If Auto-detect doesn't find your printer, or you want another setting, edit `settings.json` in the data folder. In the dock's words:

- `mode` `escpos` is *Thermal printer (ESC/POS)*, `windows` is *Windows printer driver* and `png` is *Preview only*.
- `dither` `floyd` is *Detailed*, `atkinson` is *Soft* and `threshold` is *Crisp (no shading)*.
- `cut` is `partial`, `full` or `none`, `paperWidthMm` is 80 or 58 and `printer` is the exact Windows printer name.
- `allowHostedUpdates` (`true` or `false`) is *Advanced → Download updates (layouts and program updates)*. Write it as a plain `true` or `false` without quotes. The updater treats anything else as off.
- `autoUpdateCore` (`true` or `false`) is *Install updates automatically*. The default is `false`.
- The other keys are `feedDots`, `highRollerBits`, `highRollerBitsPerInch`, `highRollerMaxInches`, `freePrintsPerMinute`, `hideLinks`, `ignoreTestTriggers` and `keepDebugFiles`.

`rendererUrl` holds where layout updates and program updates come from. Leave it alone, except as described under *Which dock?*. It must be the dock folder's full address ending with `/`, for example `https://dock.example.com/printer-bot/`, or the last part is taken for a file name and dropped. An unusable value is cleared, and the next dock that connects sets it again.

Close Streamer.bot before editing the file. Printer Bot reads it only at startup, and an edit made while it runs is lost if the dock saves a setting first.

**Auto-detect** guesses from printer names. In thermal (ESC/POS) mode it accepts only receipt-looking names (receipt, thermal, RONGTA, Epson TM, Star, Xprinter, POS), because raw printer commands sent to an office printer print pages of garbage. In the other modes it skips virtual printers (PDF, XPS, Fax, OneNote) and prefers a receipt-looking name. A printer you pick is used as long as it's installed, so pick a receipt printer.

**Test print** offers fifteen samples for Twitch, YouTube and Kick. **TwitchCheerLong** (60 lines, a lot of paper) is a 100-bit cheer, or as many bits as your High Roller threshold if that's higher, for trying out *bits per inch*. With the threshold at 0 it prints as plain text. **TwitchGiftBomb** lists 50 recipients, one to a line (about 40 cm of paper). **TwitchGiftBombBig** lists 500 (about 3 m of paper) and shows that a long list prints in full. It counts as ten of the 20 test prints a minute that the dock allows. Streamer.bot's own Test button sends sparse events, for example a gift bomb with no names and a YouTube member with no level name, so use these samples to see a full receipt.

### What viewers can put on a receipt

- Normal messages print as plain text, so markup shows up literally. They are cut at 500 characters and aren't moderated. Twitch AutoMod and Streamer.bot's own filters are the only filters.
- A cheer of at least the **High Roller (bits)** threshold may style its message with HTML: bold, colours, sizes, rotated text, tables, and Twitch, Kick, BTTV, 7TV and FFZ emotes. Always removed, High Roller or not: clickable links, scripts, event handlers, forms, frames, `<style>`, `<link>`, `<meta>`, SVG, CSS that loads anything, and images from any other site. A web address typed as plain text still prints as text. Allowed HTML can still look ugly or obnoxious, so set the threshold as high as you're comfortable with.
- A High Roller message is cut at 4000 characters of HTML and 400 elements or pieces of text. Its pictures are limited to 64 pixels (about 17 mm). A receipt with a viewer's message in it is never longer than about 1.3 m of paper. Gift sub lists have no limit, because one receipt lists every recipient. Names are cleaned of invisible and text-direction characters and cut at 48 characters.
- *Bits per inch* limits a High Roller message to *bits ÷ this number* inches. At `10`, a 100-bit cheer gets up to 10 inches and a 25-bit cheer up to 2.5 (decimals such as `2.5` work, and `0` means no limit of its own). Longer messages fade out at the limit, and the Streamer.bot log notes how much was cut. Avatars, names, logos, dates and normal messages are never limited. Without a *maximum length* (next bullet), no message prints longer than about 16.7 inches whatever the setting.
- *Maximum length* has the last word on how long a High Roller message can be. A message never prints longer than this many inches (up to 40), whatever *bits per inch* says. When it is set it also replaces the built-in 16.7 inch limit, so `30` allows messages up to 30 inches. It applies to cheers only and never shortens a gift sub list or any other receipt.
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
| `core\api1\` | program updates and the updater's notes: a folder for the downloaded version that runs and one for the version before it, and small files that record which version runs, which came before and which to skip. Its `backup\` folder keeps the last three copies of `settings.json`, made before a new version starts for the first time. |
| `settings.json.bad` | a copy of an unreadable `settings.json` (Printer Bot then uses the defaults) |
| `last_event.json`, `last_receipt.png` | only with **Keep debug files** on (they contain viewer names and messages) |

The hidden Edge keeps its own profile in `%LOCALAPPDATA%\SassyTP\printer-bot\edge-cdp-profile-v4`. An Edge process with no window in Task Manager is Printer Bot's receipt browser. It may outlive Streamer.bot, and it's safe to end because Printer Bot starts a new one when needed.

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
- **After Streamer.bot was closed and started again, its WebSocket server did not start.** The Streamer.bot log says `Failed to bind to address http://127.0.0.1:8080: address already in use`. Printer Bot 2.3.0 and older started the hidden Edge in a way that let it keep Streamer.bot's port busy after Streamer.bot closed. To fix it by hand, end the hidden Edge in Task Manager (the Edge process with no window, see *Where Printer Bot keeps its files*), then start the WebSocket server again in Streamer.bot (**Servers/Clients → WebSocket Server**). Version 2.3.1 and later start the hidden Edge so that it holds nothing of Streamer.bot's. After you import 2.4.0 over 2.3.0 or older, its first start closes the old hidden Edge. It closes any hidden (headless) browser that listens on port 9225 or 9226, the ports that older versions used, even one that another program started. A browser with a window stays. That can come after Streamer.bot has already tried to start its server, so start the server by hand once if it did not start.
- **The dock cannot connect and the page is on https.**
  - Chrome and Edge 147 and later ask once per site whether it may connect to devices on your computer or local network (**Apps on device** in Chrome, worded a little differently elsewhere). Choose **Allow**. If you blocked it, change it under **Site settings**, from the icon at the left end of the address bar.
  - The browser built into OBS 32 (Chromium 127 in OBS 32.2.2) is older and doesn't ask. It isn't known yet whether a later OBS will ask or refuse silently.
  - In Chrome and Edge 147 and later, a plain-`http` dock from the internet can't reach Streamer.bot on your PC at all, and no question is asked.
- **"The Printer Bot action in Streamer.bot is older than this dock, so some settings below are switched off."** If the note says "Open Updates above and install the new version.", press **Update** in the Updates card. Otherwise your Printer Bot is older than 2.4.0 and can't update itself. Delete the old action and import the current `import.txt` or use **Copy import code** (see **Trust** under *Which dock?*). Then switch Channel Reward on again if you use it, and reload the dock.
- **The dock looks out of date after an update.** Press **Reload dock** in the Updates card, reload the dock, or restart OBS. The dock asks Streamer.bot which Printer Bot version you run and opens the matching page, so after you import a new action the next reload shows the new dock. If OBS still shows an old page, add `?1` to the dock's address once (**Docks → Custom Browser Docks**), which forces a fresh copy.
- **"Updates come from: another address: ..."** The action remembers the first dock it met, so this appears after a dock moves to another host name or port. **Advanced → Renderer updates** shows the old address. To use this dock, press **Use this dock**, then press it again within 5 seconds when it asks "Are you sure? Click again".
- **The dock's Renderer row says "refused: ..." or "update check failed" (a dock you host yourself).** Printer Bot keeps its current layout. Upload `renderer.html`, `renderer.html.sig` and `version.json` again from the same ZIP, unchanged, and make sure no web server or CDN alters them (see *Which dock?*). If you moved your dock to another folder on the same host, see the update source bullet there.
- **The bar "Printer Bot 2.4.0 can update itself from this dock" shows above the dock.** Your Printer Bot is 2.2.1, 2.3.0 or 2.3.1. Import 2.4.0 once as described under *Updating*, or press **Hide**. Your current version keeps working either way.
- **The Updates card says "Updates are switched off in Advanced."** Switch on **Download updates (layouts and program updates)** in Advanced. A program update that you installed earlier keeps running while it is off. Press **Use the built-in version** to leave it.
- **The Updates card says "Checking soon."** Printer Bot has not asked for updates since its code started, or you have just switched **Download updates** on again. The dock asks for a check by itself within a moment. If the card stays like that, press **Check now**.
- **The Updates card says "Updates are not available."** The sentence under it names the reason:
  - "Printer Bot does not know where to get updates yet. Open the dock from its web address and connect once." Open the dock from a web address (a file on your PC doesn't work), let it connect and press **Check now**.
  - "The update host did not answer. Check your internet connection." or "The update host answered with error 503." (the number can differ). The dock's host is down or can't be reached. Try again later. Printer Bot keeps working.
  - "This dock host does not offer program updates." The host has no `core/` folder. On a dock you host yourself, upload it (see *Which dock?*).
  - "The update was not signed by the author, so it was refused." or "The downloaded update was damaged, so it was refused." On a dock you host yourself, upload `core/` again from the same ZIP, unchanged. Make sure no web server or CDN changes the files. On the author's dock, try again later. If it stays, report it as described in [SECURITY.md](SECURITY.md).
  - "The update came in a format this Printer Bot cannot read." Try again later. If it stays, import the newest `import.txt` (see *Updating*).
- **"The update did not work."** The old version keeps running, as the card says, and the sentence under it names the reason. When the download itself fails, a reason from the list above can show here too, such as "The update host did not answer. ..." or "The downloaded update was damaged, so it was refused." These two show only here:
  - "Windows or a security program would not let Printer Bot load the update." Printer Bot keeps working with the version that runs. If you want updates, look in your security program's history for a blocked item and allow it.
  - "Printer Bot could not write the update to disk." Free some disk space and check that Windows lets Streamer.bot write in its own folder.

  Press **Check now**, wait a minute and press **Update** again. If you press it sooner, or after three tries in an hour, a note under the button says "Printer Bot tried this a moment ago. Wait a minute, then try again." The red box still shows the real reason of the failure, so wait and press again. The sentence "Printer Bot is busy with a receipt. Try again in a moment." shows, for example, when the update gave up after it waited several minutes for a receipt that kept printing, or when a **Go back** button was pressed too soon after another switch (see *Going back*). Try again when nothing is printing. If the card says "The new version did not start, so the old one is running again.", that version is set aside on this PC and gets no **Update** button until the author publishes a newer one. The exception is a version that only started too slowly. You can press **Update** again for that one.
- **"Update 2.4.1 was set aside."** The card shows this in amber, with "This version failed to start on this PC before, so it is not tried again." Printer Bot keeps a list of versions to skip. A version lands on it after it failed to start here, after it stopped working, or after a crash before it had settled in. Nothing is wrong now, and a newer version is offered when the author publishes one. To clear the list, close Streamer.bot, delete the `core` folder inside the data folder and start Streamer.bot again. That also removes every downloaded update. A version that is older than an update you installed earlier is not offered, and the card then says "Up to date." with no message.
- **"Printer Bot went back to the built-in version."** A downloaded version kept failing, so Printer Bot dropped it and set it aside (see *Updating*). It prints with the built-in version meanwhile, and the card offers a newer version when the author publishes one.
- **"The author has paused updates."** The author has switched program updates off for now. Version 2.4.0 ships this way, so every install says this until the author publishes the next version. Later it can also mean the author stopped the roll-out of an update to fix a problem. Nothing is wrong with your Printer Bot. Check back later. A version you already installed stays as it is.
- **"This Printer Bot needs a one-time re-import to update." or "This update needs a newer updater. Import Printer Bot once. Your settings stay."** The update needs a newer loader than your import has. Follow the steps on the card, which are the ones under *Updating*.
- **Something is wrong after an update.** Under **More** in the Updates card, press **Go back to the previous version** or **Use the built-in version**. If the dock can't help, close Streamer.bot, delete the `core` folder inside the data folder (see *Where Printer Bot keeps its files*) and start Streamer.bot again. Printer Bot then runs the built-in version and forgets every downloaded update. Your settings stay.
- **Which lines in the Streamer.bot log are about updates?** `[Printer Bot] Program update 2.4.1 is available. Open the dock to install it.`, `[Printer Bot] Program update 2.4.1 installed.` (with "automatically" at the end after an automatic install) and `[Printer Bot] Program update 2.4.1 was not installed (...). The running program is unchanged.` The `...` holds the reason. A click that was turned away logs `[Printer Bot] A program update request was refused for now (too many tries). Try again in a while.` Other lines start with `[Printer Bot] Program 2.4.1 ...` and say what happened to a version, for example that it would not start here and was set aside. Include these lines in a report.
- **A receipt is blank or looks wrong after you added `theme.css`.** Move `theme.css` out of the folder and print again.
- **Receipts are very long.** Check `theme.css` for `vh`, `height: 100%` or `min-height: 100vh`. For a long cheer message, set **High Roller: bits per inch** or **maximum length**. Gift sub lists are long on purpose and have no limit.
- **One receipt took longer than the others.** The Streamer.bot log line for each receipt lists its time in parts that add up to **TOTAL**. After a quiet spell Streamer.bot unloads the action's code and loads it again for the next event. Printer Bot then warms up first, and that receipt waits for it. The line shows `Wait: ... (warm-up)`, usually under a second.
- **Nothing from Kick prints, not even a test from Streamer.bot.** Streamer.bot has to be logged in to Kick first. Its log (lines that start with `KickService` or `TokenManager`) says "Kick Broadcaster requested an access token, but no credentials exist" when it isn't. Log in your Kick broadcaster account in Streamer.bot's Kick settings, then try again.
- **A test from Streamer.bot prints a bare receipt.** Streamer.bot's own Test button sends sparse events. A gift bomb comes without names and a YouTube member without a level name. Real events carry that data. The dock's **Test print** samples show a full receipt (see *Test print*).
- **An event did not print.** Some events are skipped on purpose with no log line. These are single gifted subs inside a gift bomb, Kicks gifts that aren't of type LEVEL_UP, Fourthwall orders with a total of zero and Twitch raids below the Raid trigger's minimum (5). Free events over the limit log "More than N free receipts ... the extra ones are skipped". "Nothing printed for ..." appears only for an event type Printer Bot has no layout for.

## Privacy and third-party services

Printer Bot has no telemetry or analytics. Your settings, `avatars.json` and, with **Keep debug files** on, `last_event.json` and `last_receipt.png` never leave your PC. The action and the dock in this repository send no settings, receipts or usage data to the dock's host or anyone else. Drawing a receipt uses a few public services:

- **decapi.me** (Twitch) and **kick.com** (Kick) receive a viewer's login name to look up the address of their profile picture, which is remembered in `avatars.json`. Donor and buyer names on StreamElements, Streamlabs and Fourthwall are looked up as Twitch names when they use only letters, digits and underscores (up to 25 characters). No setting switches these lookups off. Test prints of Twitch or Kick samples look up the public profile picture of SassyTP.
- **Image hosts** (Twitch, Kick, YouTube and Google profile pictures, BetterTTV, 7TV, FrankerFaceZ) see an image request from your PC when they serve profile pictures and emotes. The exact list is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **The dock's web host** is the author's Cloudflare site for the hosted dock and your own server for a dock you host. It sees requests for the dock files and for update checks. The layout check asks for a version file, then the layout and signature if something newer exists. Those requests say they come from Printer Bot and which version, and the host sees your internet address. The author's Cloudflare site counts requests to the hosted dock and may log the path, the status, the country and the first part of the user agent. The dock in this repository never sends it your Streamer.bot address, port or password, which stay in your browser (a modified dock could, see **Trust** under *Which dock?*).
- **The program update check** also goes to the dock's web host, and it asks for two small files: `core/api1/manifest.json` and its signature `core/api1/manifest.json.sig`. Together they are a signed list that names the newest program. The program itself, `core/api1/core-<version>.bin`, is requested only when you press Update, or when an automatic install starts. Both ask for the two small files once more first. The check runs at the times listed under *Updating*. It asks nothing while **Download updates** is off or no update source is stored. Each request names itself `PrinterBot/<version> (updater 1.<revision>)` and carries a number that is your PC's current time, which keeps a cache from answering with an old file. It carries no cookies, no settings and no names. The host sees your internet address and the version you run. The author's Cloudflare site may log the first part of the user agent, so it can count how many installs run each version while an update rolls out.

## How it is protected

- The receipt page runs under a strict policy, and the hidden Edge can look up only the few web hosts listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Every other name fails to resolve, so even a taken-over receipt page couldn't reach other programs on your PC or home network.
- A downloaded layout is used only if it carries the author's signature, is newer than the current one and starts. The signature shows who published a layout. It doesn't show that the layout is safe.
- A program update is used only if all of this holds. The author signed it with a code key that is built into your import. The downloaded file matches the signed list byte for byte. The update is newer than the program that runs and not older than any update you installed before. It starts. Printer Bot checks a stored update again every time it starts. An update that fails a check is not used, and the version that runs stays (the built-in one if need be). The signature shows who published an update. It doesn't show that the update is safe, and it doesn't cover the dock's code or the import text. If the code key is ever stolen, the author has a second key, kept apart, that can revoke it (see [SECURITY.md](SECURITY.md)).
- Through Streamer.bot's WebSocket, the dock can only change the settings above, request sample prints from a fixed list (at most 20 a minute) and read the status and last receipt. It can also check for or reset the layout and set where updates come from. It can ask for a program update check, install the newest signed update, or go back to the previous or built-in version. Those commands carry no address, file or program. The update source is free the first time and later changes only on the dock's "Use this dock" request, which the action can't tell from anyone else's.
- Anyone who can reach an unprotected Streamer.bot WebSocket can use that same channel to waste paper, send receipts to *Preview only* and switch update checks off. They can switch automatic installs on, start a program update, go back to an earlier version and change where updates come from. They can also read the status and last receipt picture. That picture shows a viewer's name and message (see *Lock the WebSocket server*).

Three things stay true, whatever a dock host, a CDN, a connection in between, a program on your network or a hostile dock page does:

1. Nothing that reaches Printer Bot through Streamer.bot's WebSocket carries a program or a file. The only address a command can set is the update source, under the rules above, and the author's signature decides what runs from there.
2. Printer Bot runs program code from two places only: the import you pasted, and a program update signed with the code key that is built into that import and checked as listed above. Receipt layouts are a separate download with their own signature (see above).
3. So none of them can make Printer Bot run a program that the author didn't sign. They can still stop updates, or keep offering you an older update that the author signed and that is newer than the version you run. A dock page is trusted code of its own (see **Trust** under *Which dock?*).

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## What is in this folder

| File | What it is |
|---|---|
| `README.md`, `LICENSE`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md` | this guide, the licence, security reporting and third-party notices |
| `import.txt` | **the Streamer.bot import code**, the one file you need to install Printer Bot |
| `import.sha256.txt` | the SHA-256 fingerprint of `import.txt`, for the optional check under *Check your import* |
| `index.html`, `js/router.js`, `css/router.css`, `versions.json` | the launcher that asks the action for its version and opens the matching dock page, and the list of dock pages (with a hint about the newest program update, which the launcher uses for the bar described under *Updating*) |
| `v/` | the dock pages for Printer Bot 2.3.0 and later (`v/2.3.0/` and `v/2.4.0/`), one folder for each version, with its own receipt layout, signature and `version.json` |
| `core/api1/manifest.json`, `core/api1/manifest.json.sig`, `core/api1/core-<version>.bin` | program updates for the dock's **Update** button: a signed list that names the newest program, its signature and the program itself (served by the dock's host) |
| `dock-2.2.1.html`, `css/dock.css`, `js/app.js` | the dock page for Printer Bot 2.2.1 and older, kept as it was |
| `config.json` | tells the 2.2.1 dock which Printer Bot action to look for and the oldest action version it accepts (each folder under `v/` has its own) |
| `vendor/streamerbot-client.js`, `vendor/LICENSE-streamerbot-client.txt` | Streamer.bot's own client library for the dock (MIT licence, notice included) |
| `assets/logo.png`, `assets/icons/*.svg` | the dock's header picture and connection icons |
| `renderer.html`, `renderer.html.sig`, `version.json` | the receipt layout of version 2.2.1, the author's signature over it, and a small file naming the layout version (served by the dock's host for signed updates). Newer versions keep theirs under `v/` |
| `.gitignore`, `.gitattributes` | repository settings |

## Licence

Everything in this repository is under the **MIT licence** ([LICENSE](LICENSE)), except:

- the Twitch, YouTube and Kick logos, which are trademarks of their owners and are used only to say which platform an event came from
- `assets/logo.png` and the **SassyTP** name, which aren't licensed for reuse
- third-party material, which keeps its own licence (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md))

Printer Bot is an independent project. It isn't affiliated with, endorsed by or sponsored by Streamer.bot, Twitch, YouTube, Kick, StreamElements, Streamlabs, Fourthwall, OBS Project, Microsoft, BetterTTV, 7TV, FrankerFaceZ, decapi.me or any printer maker.
