# Troubleshooting

The dock's status line and the Streamer.bot log (lines starting with `[Printer Bot]`) usually name the problem. Problems with updates are covered in [Updating](UPDATING.md#when-an-update-does-not-work).

## If the dock doesn't connect

- Streamer.bot has to be running with its WebSocket server on (**Servers/Clients → WebSocket Server**, with **Auto Start** ticked). A fresh install has it set up that way, on `127.0.0.1` and port 8080.
- If the dock shows a **Streamer.bot** window, enter `127.0.0.1`, the port from the WebSocket Server settings and your password if you set one, then click **Connect**. The dock keeps these in its browser, so OBS reconnects after a restart. Untick **Remember on this computer** to skip storing the password. The round icon at the top right (green tick: connected, red cross: not) reopens the connect window. The connect window warns when the dock loads over plain http.
- If the dock says **Set up Streamer.bot**, it cannot find the action. Import the code as in step 1 of [Install](README.md#install), or click **Copy import code** and import that (see [Trust](DOCK_SELECTION.md#trust)). Then click **Check again**.
- On an https dock page, Chrome and Edge 147 and later ask once per site whether it may connect to devices on your computer or local network (**Apps on device** in Chrome, worded differently elsewhere). Choose **Allow**. If you blocked it, change it under **Site settings**, from the icon at the left end of the address bar.
- The browser built into OBS 32 (Chromium 127 in OBS 32.2.2) is older and does not ask. It is not known yet whether a later OBS will ask or refuse silently.
- Chrome and Edge 147 and later block a plain-`http` dock from the internet from reaching Streamer.bot on your PC, and they ask no question.
- If Streamer.bot's WebSocket server did not start after a restart of Streamer.bot, see [The WebSocket server did not start after a restart](#the-websocket-server-did-not-start-after-a-restart).

## Channel point rewards

Channel point rewards are off by default, which keeps a run of redemptions from using up your paper. To print them, open the **Printer Bot** action in Streamer.bot, switch on its **Channel Reward** trigger (under Twitch) and choose the reward it should react to. A trigger with no reward chosen reacts to every reward. Give the reward a cooldown and a per-stream limit in Twitch. Printer Bot also skips free receipts beyond 30 a minute (see **Free receipts per minute** in [The dock's settings](PRINTER_OPERATION.md#the-docks-settings)).

## Lock the WebSocket server (recommended)

In Streamer.bot open **Servers/Clients → WebSocket Server**, switch on **Authentication**, set a **Password** and tick **Enforce**. Then enter the password in the dock's **Streamer.bot** window. With all three in place, other programs and overlays on your PC need the password to send Printer Bot commands. Without Enforce, Streamer.bot asks for the password for only some requests. The dock can use the password only over `https://` or from this PC (`127.0.0.1` or `localhost`).

## Check your import (optional)

`import.sha256.txt` holds the SHA-256 fingerprint of `import.txt`. Compare it with the fingerprint of the import you used. There are two ways.

- **From the dock.** After you click **Copy import code**, the dock shows "SHA-256 of the text copied". The value must equal the first value in [import.sha256.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/master/import.sha256.txt) on GitHub (case does not matter). The dock works that value out itself, so it can vouch only for a dock you trust.
- **From a file.** Save [import.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/master/import.txt) from GitHub (in your browser, **Save page as**). In PowerShell type `Get-FileHash -Algorithm SHA256 ` (with a trailing space), drag the saved file into the window and press Enter. The printed **Hash** must equal the first value in `import.sha256.txt`.

The prerelease has its own pair of files, [import.prerelease.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/beta/import.prerelease.txt) and [import.prerelease.sha256.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/beta/import.prerelease.sha256.txt). The dock page of a prerelease copies `import.prerelease.txt` and names `import.prerelease.sha256.txt` in the line under the fingerprint. Compare in the same two ways.

If the values differ, do not import. Get the file again and, if it still differs, report it as described in [SECURITY.md](SECURITY.md). The fingerprint covers the import only. A program update that the dock installs later has its own check, the author's signature (see [How it is protected](PRIVACY.md#how-it-is-protected)).

## Common problems

### My printers and rules are gone

Printer Bot reads them from `settings.json` in its data folder. If Streamer.bot lost that folder, or you imported Printer Bot on a new PC, the settings start from the defaults. Open the **Backup** card of the dock and press **Restore settings**, then choose the file that **Save settings** made earlier. If you never saved one, the setup has to be made again. See [Backing up your settings](PRINTER_OPERATION.md#backing-up-your-settings).

### Nothing prints

Check in this order:

- **Output** is set to *Preview only*.
- The action is disabled. The dock then says "Streamer.bot did not answer. Is the Printer Bot action enabled?".
- **Ignore test triggers** is on and the event is a Test or Simulate.
- **Free receipts per minute** was reached ("Skipped by that limit").
- The Channel Reward trigger is still off (the default) or is set to a different reward.
- The printer is off or disconnected. Stuck jobs show as "3 receipts waiting in the queue, the oldest for 5 min. Is the printer connected and on?".

### "No printer found. Install your receipt printer, or pick one below."

The log says "...or choose one in the dock.". Install the printer in Windows, then pick it in the dock's **Printer** list or set `printer` in `settings.json`.

### It prints on the wrong printer, or pages of strange characters come out

Choose the printer yourself. If it does not speak ESC/POS, set **Output** to *Windows printer driver*.

### One of my printers prints nothing, or an event prints on the wrong printer

With more than one printer, check these:

- The card of the printer says **Not set up yet**. Choose a printer for it. A printer that is not set up takes no receipts.
- The status line says the printer is not installed. A printer 2 to 5 that was removed from Windows is not replaced by another one. Choose an installed printer.
- The card has no rules and is not the printer for everything else. Then nothing prints there. Add a rule, or turn on **Use this printer for everything else** on its card.
- Everything else prints on printer 1, although you picked another printer for it. The printer you picked is not set up. Its card and the line under **Everything else prints on** say so. Choose a printer for it, or pick another printer.
- **Check where an event prints** (in Settings, under the cards) says where an event goes. Pick the trigger, type the values your rules test and press **Check**. The Streamer.bot log has the same answer for each real event (`TwitchCheer goes to printer 1 (rule 2).`).
- A rule that is not complete keeps its last saved version. The line under the rule says what is missing.
- A rule with a test that needs a value matches nothing until the value is there. A parameter that an event does not carry fails number tests and reads as empty text in text tests.

### The last line is clipped by the cutter

Raise **Extra feed before cut**.

### "Can't start Edge: ..."

Install or repair Microsoft Edge (it comes with Windows 10 and 11), then press **Test print** again.

### The WebSocket server did not start after a restart

The Streamer.bot log says `Failed to bind to address http://127.0.0.1:8080: address already in use`. Printer Bot 2.3.0 and older started the hidden Edge in a way that kept Streamer.bot's port busy after Streamer.bot closed. End the hidden Edge in Task Manager (the Edge process with no window, see [Where Printer Bot keeps its files](PRINTER_OPERATION.md#where-printer-bot-keeps-its-files)), then start the WebSocket server again in Streamer.bot (**Servers/Clients → WebSocket Server**).

Versions 2.3.1 and later start the hidden Edge without holding anything of Streamer.bot's. The first start after you import 2.4.0 over 2.3.0 or older closes the old hidden Edge. It closes any hidden (headless) browser that listens on port 9225 or 9226, the ports older versions used, including one another program started. Browsers with a window stay open. That can happen after Streamer.bot has already tried to start its server, so start the server by hand once if it did not start.

### A receipt is blank or looks wrong after you added theme.css

Move `theme.css` out of the folder and print again.

### Receipts are too long

Check `theme.css` for `vh`, `height: 100%` or `min-height: 100vh`. For a long cheer message, set **High Roller: bits per inch** or **maximum length**. Gift sub lists are long on purpose and have no limit.

### One receipt took longer than the others

The Streamer.bot log line for each receipt lists its time in parts that add up to **TOTAL**. After a quiet spell Streamer.bot unloads the action's code and loads it again for the next event. Printer Bot then warms up first, and that receipt waits for it. The line shows `Wait: ... (warm-up)`, usually under a second.

### Nothing from Kick prints, even a test from Streamer.bot

Streamer.bot has to be logged in to Kick first. Its log (lines that start with `KickService` or `TokenManager`) says "Kick Broadcaster requested an access token, but no credentials exist" when it is not. Log in your Kick broadcaster account in Streamer.bot's Kick settings, then try again.

### A test from Streamer.bot prints a bare receipt

Streamer.bot's own Test button sends sparse events. A gift bomb comes without names and a YouTube member without a level name. Real events carry that data. The dock's **Test print** samples show a full receipt (see **Test print** in [The dock's settings](PRINTER_OPERATION.md#the-docks-settings)).

### An event did not print

Some events are skipped on purpose with no log line: single gifted subs inside a gift bomb, gifted Kicks that are not of type LEVEL_UP, Fourthwall orders with a total of zero and Twitch raids below the Raid trigger's minimum (5). Free events over the limit log "More than N free receipts ... the extra ones are skipped". "Nothing printed for ..." appears only for an event type Printer Bot has no layout for.
