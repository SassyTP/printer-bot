# Printer Bot

Printer Bot, by SassyTP, is a Streamer.bot action that prints a receipt when something happens on your stream: on a receipt printer, an inkjet or laser printer, or a Brother VC-500W sticker printer, on up to 100 printers at once. It supports Twitch, YouTube, Kick, StreamElements, Streamlabs and Fourthwall.

For each event it draws the receipt in a hidden Microsoft Edge window, turns it into a picture and sends it to your printer. A control panel, the **dock**, sits in OBS. Printing works with OBS closed.

**Credit.** Printer Bot was inspired by nutty's printer-bot. It is a separate project with its own code and its own way of working. This project uses no code from nutty's printer-bot.

**Status.** Printer Bot has been tested live on stream with Streamer.bot and OBS on three printers:

- a **RONGTA RP332** receipt printer
- a **Brother MFC-L3780CDW**, on Letter pages (8.5 x 11 in) and 4 x 6 in cards
- a **Brother VC-500W** sticker printer

To test without spending paper, set **Output** to *Preview only* (in the dock, or see *Without the dock*).

## LLM disclosure

1. LLM Used: Yes
2. LLM Disclosure Information: Claude Sonnet 5.5 was used in the creation of this code, with work specifically focused on documentation, as well as security and performance optimizations.

## Features

The newest release is **3.2.1**. Printer Bot 3.0.0 and newer update from the **Updates** card in the dock, with no new import ([Updating](UPDATING.md#update-from-the-dock)). Versions older than 3.0.0 are no longer supported: install 3.2.1 from the Updates card if it offers it, or [import it once](UPDATING.md#from-a-version-older-than-300). What changed in each version is in the [release notes](https://github.com/SassyTP/printer-bot/releases).

### Printers and paper

| | Receipt printer | Inkjet or laser printer | Brother VC-500W | No printer |
|---|:---:|:---:|:---:|:---:|
| **Output** setting to choose | Thermal printer (ESC/POS) | Windows printer driver | Brother VC-500W sticker printer | Preview only |
| 80 mm and 58 mm receipts | ✓ | ✓ | – | ✓ |
| Letter pages (8.5 x 11 in) | – | ✓ | – | ✓ |
| 4 x 6 in cards | – | ✓ | – | ✓ |
| Stickers (9, 12, 19, 25 or 50 mm tape) | – | – | ✓ | – |
| Set how long a High Roller sticker can get | – | – | ✓ 25 to 420 mm | – |
| Color | – | ✓ on pages and cards | ✓ | – |
| Pick the paper tray | – | ✓ on pages and cards | – | – |
| Cuts the paper | ✓ full, partial or none | – | ✓ full, half or none | – |
| Prints a Hype Train as one strip | ✓ | – | – | – |
| Connects by | USB or network, through Windows | USB or network, through Windows | Wi-Fi or USB, no Brother app | – |

- A receipt printer that doesn't understand ESC/POS still works: choose **Windows printer driver** for it.
- **Preview only** saves each receipt as a picture, so you can try everything without paper.
- You can mix them: up to **100 printers**, each with its own paper and settings.

### What prints

| Platform | Receipts for |
|---|---|
| Twitch | Cheers, subs and resubs, gift subs and gift bombs (every recipient listed), raids, Hype Trains, channel point rewards (off until you turn them on) |
| YouTube | Super Chats, Super Stickers, new members, member milestones, gifted memberships |
| Kick | Subs, resubs, gift subs (single and mass), raids, gifted Kicks |
| StreamElements | Tips |
| Streamlabs | Donations |
| Fourthwall | Donations, orders, memberships |

The full list, with what each receipt shows, is in [What prints](PRINTER_OPERATION.md#what-prints).

### What a receipt shows

| | Normal receipt | High Roller message |
|---|:---:|:---:|
| The viewer's profile picture | ✓ | ✓ |
| The viewer's message | ✓ as plain text | ✓ |
| Bold, colors, sizes and other styling the viewer types | – | ✓ |
| Emotes (Twitch, Kick, BetterTTV, 7TV, FrankerFaceZ) | – | ✓ |
| Pictures from Imgur, Catbox and ImgBB links | – | ✓ for the sites you turn on |
| Length limit you set (per bit, per amount, or a maximum) | – | ✓ |

- A **High Roller message** is a cheer of at least your Twitch High Roller threshold, or a Super Chat of at least your YouTube High Roller threshold, on a printer that allows it. Every printer has its own switches for both.
- A Super Chat in another currency is converted to yours with the U.S. Treasury's exchange rates.
- Printer Bot removes anything unsafe from every message: clickable links, scripts, and pictures from sites you didn't turn on.

### Hype Trains

| Receipt | When it prints |
|---|---|
| The train starts | when Twitch starts the train |
| A new Bits Conductor or Gift Sub Conductor | when someone takes the top spot |
| Level up | at every new level, with both Conductors |
| The train ends | at the end, with the top cheerers and the total, even when Twitch's end event never arrives |

**Reset Hype Train** ends a train that got stuck, and **Print Hype Trains** turns all four off.

### Choosing what prints where

| Feature | What it does |
|---|---|
| **Rules** | Send each kind of event to the printer you want, for example big cheers to one printer and everything else to another. A rule can test what came with the event: bits, tier, amount, viewers, a name or the message. |
| **Order** | Rules are read from the top, and the first match decides. Turn on **Do not stop at first match** to print on every matching rule. Drag a rule to move it. |
| **Everything else** | One printer catches every event no rule takes. |
| **Paper and tray per rule** | One printer can print big cheers on a card from one tray, and everything else on Letter paper from another. |
| **Check where an event prints** | Type an event's values and see where it would print, without printing. |

### Testing

| Feature | What it does |
|---|---|
| **Test print** | Prints a sample of any event, on one printer, on all of them, or where your rules send it. |
| **Your own values** | Change the name, amount, message or anything else first. A receipt made this way says TEST at its bottom. |
| **Real Twitch names** | Type a viewer's Twitch name and the test prints their real profile picture. **Check** tells you first whether the name is on Twitch, and shows the picture. |
| **Hype Train test** | Prints all six receipts of a train in a row. |
| **Show last receipt** | Shows what was last sent to the printer. |

### Looking after your setup

| Feature | What it does |
|---|---|
| **Backup** | Saves your printers, rules and options to a file, and restores them. Printer Bot also keeps its own copy and puts it back if the settings file is lost. |
| **Updates** | Installs new versions from the dock, with no new import, and can go back to the previous one. Automatic updates and test versions stay off until you turn them on. |
| **Printer care** | Warns when a printer looks like it can't take receipt commands, sends one test line when you ask, holds back a printer that is stuck so the others keep printing, and empties a print queue. |
| **Sticker printer care** | Over Wi-Fi, shows when the VC-500W is asleep, out of tape or still holding a sticker, and keeps the stickers until it's ready. |
| **Print queue** | From 3.3.0-beta.1 (a prerelease): a receipt that its printer can't take right now (off, unplugged, not found, held back, out of paper) waits on this PC and prints when the printer is back, in order, even after a restart. The dock lists what waits, and can discard it, move it to another printer or try again. |
| **Light on your PC** | Receipts are drawn in a hidden Microsoft Edge that runs at low priority and rests between receipts, so your stream comes first. |
| **Private** | No telemetry or analytics. [Privacy](PRIVACY.md) lists every service Printer Bot contacts. |

## Requirements

- **Windows 10 or 11** (developed and tested on Windows 11) and **Microsoft Edge**, which comes with Windows.
- **Streamer.bot 1.0.x.** Hype Train receipts need Streamer.bot 1.0.4 or newer, because Twitch stopped sending the old Hype Train events in January 2026. The dock also needs Streamer.bot's WebSocket server, which a fresh install starts by itself.
- **A printer.** A receipt printer, inkjet or laser printer installed in Windows with its driver, or a Brother VC-500W (over Wi-Fi it needs no driver). See [Printers and paper](#printers-and-paper). No printer at all works too, with **Preview only**.
- **OBS**, for the dock. Printer Bot prints without it.

## Install

Installing takes two steps.

1. **Import the code into Streamer.bot.** Open [import.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/master/import.txt), press Ctrl+A, then Ctrl+C. In Streamer.bot click **Import** (top bar), paste, and click **Import**. A new action called **Printer Bot** appears in a group called **SassyTP**.

   An import runs code inside Streamer.bot with your rights, so import only text from this repository.

2. **Add the dock to OBS.** In OBS choose **Docks → Custom Browser Docks**, enter a name (for example `Printer Bot`) and the address `https://printer-bot.spore-ta-potty.com/`, then click **Apply**. The dock connects to the Streamer.bot on your PC by itself. Under **Printer** pick your receipt printer (Auto-detect is only a guess). Under **Test**, pick a sample and press **Test print**. A sample receipt comes out, or is saved as a picture in *Preview only* mode. **Show last receipt** shows what was sent to the printer.

Printer Bot now prints a receipt for every event listed under [What prints](PRINTER_OPERATION.md#what-prints). Channel point rewards stay off until you switch them on (see [Channel point rewards](TROUBLESHOOTING.md#channel-point-rewards)).

Prerelease versions (test versions of the next release) come through the dock: switch **Try prerelease versions** on in the Updates card. [Prerelease versions](UPDATING.md#prerelease-versions) says what to expect.

Download this repository as a ZIP only if you [host your own dock](DOCK_SELECTION.md#host-it-yourself).

## Guides

- [Printer Operation](PRINTER_OPERATION.md): what prints, the output modes, the dock's settings, printers and rules, how the dock saves, backing up your settings, editing `settings.json` without the dock, what viewers can put on a receipt, the printer queue, styling receipts with `theme.css` and where Printer Bot keeps its files.
- [Privacy](PRIVACY.md): what stays on your PC, the services Printer Bot contacts and how Printer Bot is protected.
- [Troubleshooting](TROUBLESHOOTING.md): the dock does not connect, nothing prints, channel point rewards, locking the WebSocket server and checking your import.
- [Updating](UPDATING.md): how new versions reach you, installing them from the dock, prerelease versions, going back, and what the Updates card says.
- [Dock Selection](DOCK_SELECTION.md): the hosted dock or your own, and how to host one.

## What is in this folder

| File | What it is |
|---|---|
| `README.md`, `PRINTER_OPERATION.md`, `PRIVACY.md`, `TROUBLESHOOTING.md`, `UPDATING.md`, `DOCK_SELECTION.md`, `LICENSE`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md` | this guide and the five guides it links to, the licence, security reporting and third-party notices |
| `import.txt` | **the Streamer.bot import code**, the one file you need to install Printer Bot |
| `import.sha256.txt` | the SHA-256 fingerprint of `import.txt`, for the optional check in [Troubleshooting](TROUBLESHOOTING.md#check-your-import-optional) |
| `import.prerelease.txt`, `import.prerelease.sha256.txt` | the same two files for the prerelease (see [Prerelease versions](UPDATING.md#prerelease-versions)) |
| `index.html`, `js/router.js`, `css/router.css`, `versions.json` | the launcher that asks the action for its version and opens the matching dock page, and the list of dock pages (with a hint about the newest program update and about versions that need a new import, which the launcher uses for the bar described in [A later change to the import](UPDATING.md#a-later-change-to-the-import)) |
| `v/` | the dock pages for Printer Bot 3.0.0 and later (`v/3.0.0/`, `v/3.2.0-beta.1/` to `v/3.2.0-beta.9/`, `v/3.2.0/` and `v/3.2.1/`), one folder for each version, with its own receipt layout, signature and `version.json` |
| `core/api1/manifest.json`, `core/api1/manifest.json.sig`, `core/api1/core-<version>.bin` | program updates for the dock's **Update** button: a signed list that names the newest program, its signature and the program itself (served by the dock's host) |
| `core/api1/prerelease/` | the same three files for the prerelease, which Printer Bot reads only when you switch **Try prerelease versions** on |
| `vendor/streamerbot-client.js`, `vendor/LICENSE-streamerbot-client.txt` | Streamer.bot's own client library for the dock (MIT licence, notice included) |
| `assets/logo.png` | the dock's header picture |
| `.gitignore`, `.gitattributes` | repository settings |

## Licence

Everything in this repository is under the **MIT licence** ([LICENSE](LICENSE)), except:

- the Twitch, YouTube and Kick logos, which are trademarks of their owners and are used only to say which platform an event came from
- `assets/logo.png` and the **SassyTP** name, which aren't licensed for reuse
- third-party material, which keeps its own licence (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md))

Printer Bot is an independent project. It isn't affiliated with, endorsed by or sponsored by Streamer.bot, Twitch, YouTube, Kick, StreamElements, Streamlabs, Fourthwall, OBS Project, Microsoft, BetterTTV, 7TV, FrankerFaceZ, decapi.me or any printer maker.
