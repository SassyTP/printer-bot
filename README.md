# Printer Bot

Printer Bot, by SassyTP, is a Streamer.bot action that prints a receipt on a thermal printer, or on up to 100 of them, when something happens on your stream. It supports Twitch, YouTube, Kick, StreamElements, Streamlabs and Fourthwall.

For each event it draws the receipt in a hidden Microsoft Edge window, turns it into a black-and-white picture and sends it to your printer. A control panel, the **dock**, sits in OBS. Printing works with OBS closed.

**Credit.** Printer Bot was inspired by nutty's printer-bot. It is a separate project with its own code and its own way of working. This project uses no code from nutty's printer-bot.

**Status.** Printer Bot has run live on stream with Streamer.bot, OBS and a RONGTA RP332 thermal printer. To test without spending paper, set **Output** to *Preview only* (in the dock, or see *Without the dock*).

## LLM disclosure

1. LLM Used: Yes
2. LLM Disclosure Information: Claude Sonnet 5.5 was used in the creation of this code, with work specifically focused on documentation, as well as security and performance optimizations.

## Features

The newest release is **3.2.0**. Printer Bot 3.0.0 and newer update from the **Updates** card in the dock, with no new import ([Updating](UPDATING.md#update-from-the-dock)). Versions older than 3.0.0 are no longer supported: install 3.2.0 from the Updates card if it offers it, or [import it once](UPDATING.md#from-a-version-older-than-300). What changed in each version is in the [release notes](https://github.com/SassyTP/printer-bot/releases).

| Feature | What it does |
|---|---|
| **Up to 100 printers** | Each printer has its own paper, output, picture style, paper cut and extra feed, so an 80 mm and a 58 mm printer can work side by side. With more than five extra printers the cards start closed, and **Expand all**, **Collapse all** and **Find a printer** help with a long list. |
| **Rules** | One list, **Rules**, decides which printer, paper and tray each event uses. A rule names a trigger (for example Twitch: Cheer) and can test the values Streamer.bot sends with it: bits, tier, viewers, amount, a name, the message and more. Rules are checked from the top and the first match wins; with **Do not stop at first match** on, every matching rule prints. **Everything else** takes the events no rule takes. Drag a rule by its handle to move it. |
| **Check where an event prints** | Says which printers, papers and trays an event with the values you type would print on, without printing anything. |
| **Test prints** | Any event, with the values you type, on one printer, on all of them, or where your rules send it. A test receipt says TEST at its bottom. |
| **Papers** | 80 mm and 58 mm rolls on thermal printers. On the **Windows printer driver** and **Preview only** also **Letter (8.5 x 11 in)** and **4 x 6 in cards**, in black and white or color (**Print profile**), from the **Tray** you choose, for the printer or for a single rule. |
| **Letter layouts** | **Scaled like 80 mm** prints the roll receipt larger. **Large message** gives a High Roller cheer, a High Roller Super Chat or a gift sub the whole page for its message and pictures, set as **Image fit** says (Fit, Fill or Stretch). A long gifted-subs list goes on to more pages, in columns. |
| **4 x 6 in cards** | A High Roller message fills the card: its pictures on the right, its words in a narrow column on the left. Every other receipt prints as the 80 mm receipt, made as large as the card allows. |
| **Brother VC-500W stickers** | Prints colour stickers over Wi-Fi or USB with no Brother software. The tape is read from the printer or chosen; quality and cut are settings of the printer. A High Roller message gets a sticker layout of its own; every other receipt prints as the 80 mm receipt shrunk to the tape. When the printer is asleep, out of tape or unreachable, up to ten receipts wait and print once it's ready. |
| **Pictures in High Roller messages** | A link to a picture on Imgur, Catbox or ImgBB (an album gives its first picture) prints as the picture, for the sites you switch on under **Images in messages**. Each printer has **Allow images**. Any other message prints its words only. |
| **High Roller** | **Allow Twitch High Roller prints** and **Allow YouTube High Roller prints** under every printer. A YouTube Super Chat in another currency is converted with the exchange rates of the U.S. Treasury. Lengths are set in bits (or amount) per inch, with a maximum length. |
| **Hype Trains** | Receipts for the start, each level and the end of a train. The end receipt prints even when Twitch's End event never arrives (**Hype Train end wait**), **Do not cut Hype Trains** prints a train as one strip, and **Reset Hype Train** ends a train that never ended. |
| **Printer care** | Warns when a printer on thermal output looks like an office printer. **Check this printer** sends one test line, a printer that holds up its queue is held back so the others go on, and **Clear print queue** empties a queue. |
| **Settings stay safe** | The **Backup** card saves your printers, rules and options to a file and restores them. Printer Bot keeps its own copy of `settings.json` and puts it back when the file is lost. A change made while Streamer.bot is unreachable is sent once it is back, and a second dock can't put older settings back. |
| **Updates** | The **Updates** card installs new versions and can go back to the previous one. **Install updates automatically** and **Try prerelease versions** are off until you switch them on. After an update a notice at the top of the dock says to reload it. |
| **A quiet hidden browser** | Receipts are drawn in a hidden Microsoft Edge that starts below normal priority and rests 1.5 seconds after the last receipt, so your stream comes first. **Printers per browser** sets how many printers one browser serves. |

## Requirements

- **Windows 10 or 11** (developed and tested on Windows 11) and **Microsoft Edge**, which comes with Windows.
- **Streamer.bot 1.0.x.** Hype Train receipts need Streamer.bot 1.0.4 or newer, because Twitch stopped sending the old Hype Train events in January 2026. The dock also needs Streamer.bot's WebSocket server, which a fresh install starts by itself.
- **A receipt printer installed in Windows**, with its driver. Printer Bot is built for ESC/POS thermal printers (the command language most receipt printers understand). *Output* lists the other modes.
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
| `v/` | the dock pages for Printer Bot 3.0.0 and later (`v/3.0.0/`, `v/3.2.0-beta.1/` to `v/3.2.0-beta.9/` and `v/3.2.0/`), one folder for each version, with its own receipt layout, signature and `version.json` |
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
