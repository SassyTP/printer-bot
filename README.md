# Printer Bot

Printer Bot, by SassyTP, is a Streamer.bot action that prints a receipt on a thermal printer, or on up to five of them, when something happens on your stream. It supports Twitch, YouTube, Kick, StreamElements, Streamlabs and Fourthwall.

For each event it draws the receipt in a hidden Microsoft Edge window, turns it into a black-and-white picture and sends it to your printer. A control panel, the **dock**, sits in OBS. Printing works with OBS closed.

**Credit.** Printer Bot was inspired by nutty's printer-bot. It is a separate project with its own code and its own way of working. This project uses no code from nutty's printer-bot.

**Status.** Printer Bot has run live on stream with Streamer.bot, OBS and a RONGTA RP332 thermal printer. To test without spending paper, set **Output** to *Preview only* (in the dock, or see *Without the dock*).

## LLM disclosure

1. LLM Used: Yes
2. LLM Disclosure Information: Claude Sonnet 5.5 was used in the creation of this code, with work specifically focused on documentation, as well as security and performance optimizations.

## Prerelease 3.0.0-beta.1

The newest release is 2.5.4. Version 3.0.0-beta.1 is a prerelease, a test version of the next release that you can try if you want to. It can have mistakes. [Prerelease versions](UPDATING.md#prerelease-versions) has the steps to try it and the steps to go back to 2.5.4.

What is new in it:

1. **Up to five printers at once.** In the dock, **Add another printer** (under the rows of the first printer) gives the dock a card for each printer. Every printer has its own paper width, output, picture style, paper cut and extra feed, so an 80 mm printer and a 58 mm printer can work side by side. With one printer the dock looks and works as it did before 3.0.0.
2. **Rules choose the printer.** A rule names a trigger, such as Twitch: Cheer, and can test the parameters Streamer.bot sends with it: the bits of a cheer, the tier of a subscription, the viewers of a raid, the amount of a tip, a name, a message and more, for every kind of event Printer Bot prints. For example, cheers of more than 500 bits print on printer 1, and cheers of 500 bits or less print on printer 3. A rule holds up to four tests and all of them have to pass. An event prints on every printer that has a rule it passes.
3. **Everything else.** One printer takes each event that no rule names. Turn on the switch **Use this printer for everything else** on its card, or choose the printer in the list **Everything else prints on** under the cards. Both show the same pick, and the switch that was on goes off. It is printer 1 until you pick another.
4. **Checking.** **Test print** goes to one printer or to all of them. **Check where an event prints** says which printers an event with the values you type would print on, and prints nothing.
5. Settings from 2.5 load as one printer with no rules, so nothing changes until you add a printer.
6. **Save settings.** The dock has a new **Backup** card. **Save settings** writes your printers, rules and print options to a file with one click, and **Restore settings** puts them back. If Streamer.bot ever loses its data, the file saves you the setup work. See [Backing up your settings](PRINTER_OPERATION.md#backing-up-your-settings).
7. **Prerelease versions are your choice.** The Updates card has a new switch, **Try prerelease versions**. It is off until you switch it on. **Install updates automatically** is off until you switch it on, and a prerelease is never installed by itself.

## Requirements

- **Windows 10 or 11** (developed and tested on Windows 11) and **Microsoft Edge**, which comes with Windows.
- **Streamer.bot 1.0.x.** The dock also needs Streamer.bot's WebSocket server, which a fresh install starts by itself.
- **A receipt printer installed in Windows**, with its driver. Printer Bot is built for ESC/POS thermal printers (the command language most receipt printers understand). *Output* lists the other modes.
- **OBS**, for the dock. Printer Bot prints without it.

## Install

Installing takes two steps.

1. **Import the code into Streamer.bot.** Open [import.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/master/import.txt), press Ctrl+A, then Ctrl+C. In Streamer.bot click **Import** (top bar), paste, and click **Import**. A new action called **Printer Bot** appears in a group called **SassyTP**.

   An import runs code inside Streamer.bot with your rights, so import only text from this repository.

2. **Add the dock to OBS.** In OBS choose **Docks → Custom Browser Docks**, enter a name (for example `Printer Bot`) and the address `https://printer-bot.spore-ta-potty.com/`, then click **Apply**. The dock connects to the Streamer.bot on your PC by itself. Under **Printer** pick your receipt printer (Auto-detect is only a guess). Under **Test**, pick a sample and press **Test print**. A sample receipt comes out, or is saved as a picture in *Preview only* mode. **Show last receipt** shows what was sent to the printer.

Printer Bot now prints a receipt for every event listed under [What prints](PRINTER_OPERATION.md#what-prints). Channel point rewards stay off until you switch them on (see [Channel point rewards](TROUBLESHOOTING.md#channel-point-rewards)).

To try the prerelease, import [import.prerelease.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/beta/import.prerelease.txt) in step 1 instead. [Prerelease versions](UPDATING.md#prerelease-versions) says what to expect.

Download this repository as a ZIP only if you [host your own dock](DOCK_SELECTION.md#host-it-yourself).

## Guides

- [Printer Operation](PRINTER_OPERATION.md): what prints, the output modes, the dock's settings, printers and rules, backing up your settings, editing `settings.json` without the dock, what viewers can put on a receipt, the printer queue, styling receipts with `theme.css` and where Printer Bot keeps its files.
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
| `index.html`, `js/router.js`, `css/router.css`, `versions.json` | the launcher that asks the action for its version and opens the matching dock page, and the list of dock pages (with a hint about the newest program update, which the launcher uses for the bar described in [Updating](UPDATING.md#from-230-or-231-import-once)) |
| `v/` | the dock pages for Printer Bot 2.3.0 and later (`v/2.3.0/`, `v/2.4.0/`, `v/2.4.5/`, `v/2.5.0/` and `v/3.0.0-beta.1/`), one folder for each version, with its own receipt layout, signature and `version.json` |
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
