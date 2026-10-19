# Printer Bot

Printer Bot, by SassyTP, is a Streamer.bot action that prints a receipt on a thermal printer, or on up to 100 of them, when something happens on your stream. It supports Twitch, YouTube, Kick, StreamElements, Streamlabs and Fourthwall.

For each event it draws the receipt in a hidden Microsoft Edge window, turns it into a black-and-white picture and sends it to your printer. A control panel, the **dock**, sits in OBS. Printing works with OBS closed.

**Credit.** Printer Bot was inspired by nutty's printer-bot. It is a separate project with its own code and its own way of working. This project uses no code from nutty's printer-bot.

**Status.** Printer Bot has run live on stream with Streamer.bot, OBS and a RONGTA RP332 thermal printer. To test without spending paper, set **Output** to *Preview only* (in the dock, or see *Without the dock*).

## LLM disclosure

1. LLM Used: Yes
2. LLM Disclosure Information: Claude Sonnet 5.5 was used in the creation of this code, with work specifically focused on documentation, as well as security and performance optimizations.

## What is new in 3.0

The newest release is 3.1.1, which fixes a Catbox album that starts with a video and goes on with pictures: it printed the first picture, and now its link prints as text, as only the first item of an album may print. 3.1.0 did the same as 3.0.11 for Catbox and ImgBB: a Catbox album (`catbox.moe/c/<id>`) and an ImgBB album (`ibb.co/album/<id>`) print their first picture only, an ImgBB viewer link (`ibb.co/<id>`) prints its picture, and a Catbox thumbnail prints the file itself. 3.0.11 printed the Imgur links viewers copy from the Imgur site: the page of one picture (`imgur.com/<name>`) prints that picture, and an album or post (`imgur.com/a/<id>`) prints its first picture only. 3.0.10 changed nothing you can see: YouTube High Roller and a printer rule now judge the amount of a Super Chat the same way, to the cent. 3.0.9 made a printer rule test the amount of a Super Chat in your YouTube currency (a rule for 20 dollars no longer takes 200 Argentine pesos for 200), after an update the dock asks for no restart of Streamer.bot (only **Reload dock**, and only until the dock has reloaded), and the space under a closed **More values** in the Test card is even. 3.0.8 tidied up the Test card of the dock: the card is closed until you open it, its list is grouped by platform, a Super Chat or a donation has one Amount box and the receipt shows the currency you pick, and a value with a fixed set, such as the tier of a sub, is a real dropdown. 3.0.7 made test prints with your own values work in Streamer.bot. 3.0.6 left no gap where a cheermote was taken out of a cheer's message, took out only real cheer amounts (1 to 100,000 bits), and kept the dock from showing the setup card by mistake when the connection to Streamer.bot drops. 3.0.5 stopped the hidden receipt browsers from causing failed Windows sign-ins, gave a YouTube Super Chat the top of a Twitch cheer (picture, amount, "Name sent a Super Chat!", date) with only the message in the box, a grey placeholder for a YouTube receipt without a picture, and keeps **Large message** on Letter paper for High Roller cheers, High Roller Super Chats and gift subs. 3.0.4 lets you test every event from the dock with values you type, and such a test receipt says TEST at its bottom. 3.0.3 made **Save settings** work in an OBS dock and grouped the **Advanced** settings by platform, 3.0.2 filled the pages of a long gifted-subs list on Letter paper and brought YouTube High Roller, and 3.0.1 fixed what the first prints of 3.0.0 showed. If you run 2.5.0 or newer you update from the Updates card and need no new import ([Updating](UPDATING.md#from-250-or-newer-to-311)). The full list of changes since 2.5.4 is in the release notes of [3.0.0](https://github.com/SassyTP/printer-bot/releases/tag/v3.0.0), [3.0.1](https://github.com/SassyTP/printer-bot/releases/tag/v3.0.1), [3.0.2](https://github.com/SassyTP/printer-bot/releases/tag/v3.0.2), [3.0.3](https://github.com/SassyTP/printer-bot/releases/tag/v3.0.3), [3.0.4](https://github.com/SassyTP/printer-bot/releases/tag/v3.0.4), [3.0.5](https://github.com/SassyTP/printer-bot/releases/tag/v3.0.5), [3.0.6](https://github.com/SassyTP/printer-bot/releases/tag/v3.0.6) and [3.0.7](https://github.com/SassyTP/printer-bot/releases/tag/v3.0.7). With one printer the dock works as it did before, and settings from 2.5 load as one printer with no rules. In short: A prerelease, 3.2.0-beta.1, is out beside it: it prints stickers on a Brother VC-500W colour sticker printer, over Wi-Fi or USB, driven by Printer Bot itself with the printer's own commands, with a sticker layout for High Roller messages and the cut made by the printer after every receipt. It reaches you only with **Try prerelease versions** on (see [Prerelease versions](UPDATING.md#prerelease-versions)); everyone else stays on 3.1.1.

1. **Up to 100 printers at once.** **Add another printer** (under the rows of the first printer) gives the dock a card for each printer. Every printer has its own paper, output, picture style, paper cut and extra feed, so an 80 mm printer and a 58 mm printer can work side by side. With more than five extra printers the cards start closed, one line each, and **Expand all**, **Collapse all** and **Find a printer** help with a long list.
2. **Rules choose the printer.** A rule names a trigger, such as Twitch: Cheer, and can test the values Streamer.bot sends with it: the bits of a cheer, the tier of a subscription, the viewers of a raid, the amount of a tip, a name, a message and more. Number tests read `equals (=)`, `greater than or equal to (≥)` and so on. One printer takes each event that no rule names. **Check where an event prints** says which printers an event with the values you type would print on, and prints nothing. **Test print** goes to one printer or all of them, and with **Follow the rules** on it goes where your rules send that kind of event.
3. **Letter paper (8.5 x 11 in).** The paper list of every printer has a third entry, **Letter (8.5 x 11 in)**, for a printer on the **Windows printer driver** and for **Preview only**. **Print profile** picks black and white or color. A receipt takes one page.
4. **Two layouts for Letter paper.** **Scaled like 80 mm** is the receipt of a roll made larger. **Large message** puts a small profile picture, the amount, the name and the time at the top, a smaller platform logo at the bottom, and gives all the space between to the message and its pictures, or to the names of a gift list. From 3.0.5 that is for High Roller cheers, High Roller Super Chats and gift subs; every other receipt on that printer prints scaled. **Image fit** (**Fit**, which is the default, **Fill** or **Stretch**) says how a picture fills that space. On Letter paper a receipt takes one page, and the names of a gifted-subs list are set in columns so that up to 100 of them fit on one page. A list with more than 100 names goes on to more pages: 100 on the first, and in the Large message layout on each page after it as many as fit (3.0.2, about 130 to 190), with the logo of the platform at the bottom of every page. On an 80 mm or 58 mm roll a gifted-subs list prints in two columns when every name fits half the width.
5. **Pictures in High Roller messages.** A link to a picture on Imgur, Catbox or ImgBB prints as the picture inside a High Roller message, for the sites you switch on under **Images in messages** (all off until you do). From 3.0.11 the page of an Imgur picture (`imgur.com/<name>`) prints that picture, and an Imgur album or post (`imgur.com/a/<id>`) prints its first picture only. From 3.1.0 a Catbox or ImgBB album prints its first picture only, and an ImgBB viewer link (`ibb.co/<id>`) prints its picture. Each printer has a switch, **Allow images**. A High Roller message keeps its styling and shows a picture from a link or an `<img>` tag. Any other message, a cheer under the Twitch High Roller threshold or a cheer on a printer with **Allow Twitch High Roller prints** off included, has no pictures and no styling: it prints the words it says, not the tags.
6. **High Roller, for each printer.** **Allow Twitch High Roller prints** is a switch under every printer, and from 3.0.2 so is **Allow YouTube High Roller prints**, which is off until you switch it on: a Super Chat of at least the **YouTube High Roller threshold (amount)**, in your currency, then prints its message styled, as a High Roller cheer does, with a length limit of its own (*amount per inch*). A Super Chat in another currency is converted with the exchange rates of the U.S. Treasury. Lengths of High Roller messages are lengths of paper, and on Letter paper a High Roller message stops at the end of its page.
7. **Hype Trains.** The end receipt prints by itself when Twitch's End event never arrives (**Hype Train end wait** is the setting), and **Do not cut Hype Trains** prints a train as one strip on a thermal printer. **Reset Hype Train** ends a train that never ended.
8. **Printer care.** The dock warns when a printer on thermal output looks like an office printer. **Check this printer** sends one test line, a printer that holds up the queue is held back so the others go on, and **Clear print queue** empties a queue after two clicks.
9. **Settings are kept.** The **Backup** card saves your printers, rules and options to a file and restores them. Printer Bot also keeps its own copy of `settings.json` and puts it back when the file is lost. A change you make while the connection to Streamer.bot is down is kept and sent when it is back.
10. **A larger profile picture.** The picture at the top of a receipt is about 10 mm larger on 80 mm paper and about 5 mm larger on 58 mm paper, and the receipt is as long as before.
11. **A hidden browser that rests.** Printer Bot draws every receipt in a hidden Edge. It puts the receipt away 1.5 seconds after the last one and starts below normal priority, so your stream comes first. **Printers per browser** says how many printers one browser serves.
12. **Prerelease versions are your choice.** The Updates card has a switch, **Try prerelease versions**. It is off until you switch it on. **Install updates automatically** is off until you switch it on, and a prerelease is never installed by itself. When a version needs a new import in Streamer.bot, the dock shows a bar above the page to a Printer Bot that is older than that version.

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

To try a prerelease, import [import.prerelease.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/master/import.prerelease.txt) in step 1 instead (it exists only while a prerelease is out). [Prerelease versions](UPDATING.md#prerelease-versions) says what to expect.

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
| `index.html`, `js/router.js`, `css/router.css`, `versions.json` | the launcher that asks the action for its version and opens the matching dock page, and the list of dock pages (with a hint about the newest program update and about versions that need a new import, which the launcher uses for the bars described in [Updating](UPDATING.md#from-230-or-231-import-once) and [A later change to the import](UPDATING.md#a-later-change-to-the-import)) |
| `v/` | the dock pages for Printer Bot 2.3.0 and later (`v/2.3.0/`, `v/2.4.0/`, `v/2.4.5/`, `v/2.5.0/`, the folders of the 3.0 prereleases, `v/3.0.0/`, `v/3.2.0-beta.1/`, `v/3.2.0-beta.2/`, `v/3.2.0-beta.3/`, `v/3.2.0-beta.4/`, `v/3.2.0-beta.5/` and `v/3.2.0-beta.6/`), one folder for each version, with its own receipt layout, signature and `version.json` |
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
