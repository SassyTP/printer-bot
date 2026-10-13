# Printer Bot

Printer Bot, by SassyTP, is a Streamer.bot action that prints a receipt on a thermal printer, or on up to 100 of them, when something happens on your stream. It supports Twitch, YouTube, Kick, StreamElements, Streamlabs and Fourthwall.

For each event it draws the receipt in a hidden Microsoft Edge window, turns it into a black-and-white picture and sends it to your printer. A control panel, the **dock**, sits in OBS. Printing works with OBS closed.

**Credit.** Printer Bot was inspired by nutty's printer-bot. It is a separate project with its own code and its own way of working. This project uses no code from nutty's printer-bot.

**Status.** Printer Bot has run live on stream with Streamer.bot, OBS and a RONGTA RP332 thermal printer. To test without spending paper, set **Output** to *Preview only* (in the dock, or see *Without the dock*).

## LLM disclosure

1. LLM Used: Yes
2. LLM Disclosure Information: Claude Sonnet 5.5 was used in the creation of this code, with work specifically focused on documentation, as well as security and performance optimizations.

## Prerelease 3.0.0-beta.9

The newest release is 2.5.4. Version 3.0.0-beta.9 is a prerelease, a test version of the next release that you can try if you want to. It can have mistakes. [Prerelease versions](UPDATING.md#prerelease-versions) has the steps to try it, the steps to update from 3.0.0-beta.8 (no new import is needed) and the steps to go back to 2.5.4.

What is new in it:

1. **Up to 100 printers at once.** In the dock, **Add another printer** (under the rows of the first printer) gives the dock a card for each printer. Every printer has its own paper width, output, picture style, paper cut and extra feed, so an 80 mm printer and a 58 mm printer can work side by side. With more than five extra printers the cards start closed, one line for each printer with its number, its name, its paper width, its output and how many rules send to it. Click the title of a card to open it. A line that says **Needs attention** is a printer with no printer chosen, a printer that Windows does not have, or a printer whose print queue has a problem. **Expand all**, **Collapse all** and **Find a printer** help with a long list. With one printer the dock looks and works as it did before 3.0.0.
2. **Rules choose the printer.** A rule names a trigger, such as Twitch: Cheer, and can test the parameters Streamer.bot sends with it: the bits of a cheer, the tier of a subscription, the viewers of a raid, the amount of a tip, a name, a message and more, for every kind of event Printer Bot prints. For example, cheers of more than 500 bits print on printer 1, and cheers of 500 bits or less print on printer 3. A rule holds up to four tests and all of them have to pass. Printer Bot keeps up to 300 rules. An event prints on every printer that has a rule it passes.
3. **Everything else.** One printer takes each event that no rule names. Turn on the switch **Use this printer for everything else** on its card, or choose the printer in the list **Everything else prints on** under the cards. Both show the same pick, and the switch that was on goes off. It is printer 1 until you pick another.
4. **Checking.** **Test print** goes to one printer or to all of them. **Check where an event prints** says which printers an event with the values you type would print on, and prints nothing.
5. Settings from 2.5 load as one printer with no rules, so nothing changes until you add a printer.
6. **Save settings.** The dock has a new **Backup** card. **Save settings** writes your printers, rules and print options to a file with one click, and **Restore settings** puts them back. If Streamer.bot ever loses its data, the file saves you the setup work. See [Backing up your settings](PRINTER_OPERATION.md#backing-up-your-settings).
7. **A backup copy of your settings.** Printer Bot also keeps a copy of `settings.json` (and `theme.css`) outside the Streamer.bot folder, in `%LOCALAPPDATA%\SassyTP\printer-bot\mirror`. When Printer Bot starts and `settings.json` is missing or damaged, it puts the copy back and says so in the log and in the dock. See [Backing up your settings](PRINTER_OPERATION.md#backing-up-your-settings).
8. **Changes are kept when the connection drops.** If the dock loses its connection to Streamer.bot (for example while Streamer.bot restarts) after you changed a setting, the dock keeps the change and sends it when the connection is back. While a change waits, the dock says "Not saved yet. Waiting for Streamer.bot." The **Saved** mark shows only when Printer Bot reports the new value.
9. **A larger profile picture.** The picture at the top of a receipt is about 10 mm larger on 80 mm paper and about 5 mm larger on 58 mm paper, and the receipt is as long as before.
10. **A warning about imports.** When a version needs a new import in Streamer.bot, the dock shows a bar above the page to a Printer Bot that is older than the newest version that changed the import. See [A later change to the import](UPDATING.md#a-later-change-to-the-import). A Printer Bot from 2.4.0 to 2.4.5 sees the bar as well, because 2.5.0 added the Hype Train triggers, which only an import carries.
11. **Prerelease versions are your choice.** The Updates card has a switch, **Try prerelease versions**. It is off until you switch it on. **Install updates automatically** is off until you switch it on, and a prerelease is never installed by itself.
12. **Printers per browser.** Printer Bot draws receipts in hidden Edge browsers. The new setting **Printers per browser** (in Settings, with two printers or more) says how many printers one browser serves, a whole number from 1 to 100. With 3 per browser, 9 printers use 3 browsers and 10 printers use 4. The default of 100 keeps every printer in one browser, as before. The dock refuses 0, negative numbers and anything that is not a whole number, and says so under the setting. See [Printers and rules](PRINTER_OPERATION.md#printers-and-rules).
13. **Test prints that follow your rules.** With two printers or more, the Test card has a switch, **Follow the rules**. Switched on, a test print goes where your rules send an event of that kind, using the values the sample carries, in place of the printers you pick in **Print on**. See [Printers and rules](PRINTER_OPERATION.md#printers-and-rules).
14. **Every printer card closes.** The card of printer 1 opens and closes like the cards of printers 2 and up, so any printer settings box can be folded away to save space.
15. **The end of a Hype Train.** Twitch ends a Hype Train with an End event. If that event never reaches Printer Bot, the end receipt used to wait for the next train. Printer Bot now keeps the time each Hype Train is due to expire (Twitch moves it on at every level up). When no End event has come by that time plus a wait, Printer Bot prints the end receipt itself from what it saw, with the row *Ended*, *time ran out*. A real End that arrives afterwards prints nothing a second time. The wait is the new setting **Advanced → Hype Train end wait (seconds)**, a whole number from 90 to 300 (90 by default). The dock refuses anything else. Hype Train events reach Printer Bot only from Streamer.bot 1.0.4 or newer. See [What prints](PRINTER_OPERATION.md#what-prints).
16. **Printers that do not take ESC/POS.** ESC/POS is a command language. A printer that does not understand it prints pages of strange characters or keeps the job stuck, and the receipts behind it wait. The dock now warns when a printer on Thermal output looks like an office or home printer, with one click to switch it to the Windows printer driver. A button, **Check this printer**, sends one short test line after you press it and asks whether it printed. When a receipt that Printer Bot sent stays in a print queue that reports no problem, Printer Bot holds that printer back. Its next receipts fail at once with the reason in place of piling up behind the stuck job, and the dock offers **Clear stuck jobs** and **Try again**. See [Printers that do not take ESC/POS](PRINTER_OPERATION.md#printers-that-do-not-take-escpos).
17. **Letter paper (8.5 x 11 in).** The paper list of every printer has a third entry, **Letter (8.5 x 11 in)**, for a printer on the **Windows printer driver** and for **Preview only**. A thermal printer prints on its roll, so the entry is off for it. A Letter receipt is laid out 400 pixels wide and printed 7.5 inches wide with half an inch of margin on every side, so text and pictures come out about 1.8 times as large as on an 80 mm roll and a line holds about half as much text again. A typical receipt fits on one page. A longer receipt goes on to the next page, and a page ends between two lines of text, so no line is cut in two. At most 10 pages print in black and white and 5 in color. See [Letter paper and print profiles](PRINTER_OPERATION.md#letter-paper-and-print-profiles).
18. **Black and white or color.** A printer on Letter paper with the Windows printer driver has a row **Print profile**. **Black and white** (the default) shades the pictures of the receipt, the viewer's picture and the images of a message, with the **Picture style** at 300 dots to the inch and prints the letters and the lines as they are, so they stay sharp. **Color** prints the receipt as it looks with no shading and sets the printer driver to print in color. A thermal printer cannot print in color, so only the Windows printer driver has the row.
19. **Allow High Roller prints.** While **High Roller (bits)** is above 0, every printer has a switch, **Allow High Roller prints**, under its settings. A printer with the switch off prints a High Roller cheer as an ordinary cheer with plain text, and the other printers print it styled. When the switch is off on every printer and **High Roller (bits)** is above 0, the dock says so under the box. The limits on the length of a High Roller message count inches of paper, so 2 inches are 2 inches on a roll and on Letter paper.
20. **A High Roller message stays on one page of Letter paper.** On Letter paper the message of a High Roller cheer stops at the end of its page, so a cheer with a very large message prints on one sheet. The viewer's picture, the name and the footer come first, and the message gets what is left of the page, about 2 inches on a receipt with a picture. A longer message fades out at the end. A roll prints a continuous strip and keeps its limits. See [Letter paper and print profiles](PRINTER_OPERATION.md#letter-paper-and-print-profiles).
21. **Check this printer, and Clear print queue.** The test line of **Check this printer** ends with a cut, so the paper is easy to take. **Check again** works at once after you answer **Yes, it printed** or **No**. Before, a click within 5 seconds of the first test line was ignored without a word: the button turned gray, then normal, and did nothing. A click that is ignored now has a line in the Streamer.bot log. After the answer **No**, the button that follows is **Use the Windows printer driver on Letter paper**, because most printers that do not take ESC/POS are ordinary office or home printers. Every printer with a print queue on this PC has a button **Clear print queue**, which takes every job out of that queue after two clicks. See [Printers that do not take ESC/POS](PRINTER_OPERATION.md#printers-that-do-not-take-escpos).
22. **Do not cut Hype Trains.** A printer on thermal output has a box, **Do not cut Hype Trains**. With it on, the printer also takes the four Hype Train triggers, and every receipt it prints from the first Hype Train receipt to the End goes out without a cut, so the train is one strip of paper. Other events that print on that printer in the meantime, such as a YouTube event, come out inside the strip, and the dock says so under the box. The strip is cut when the train ends. When Printer Bot does not see the end, the button **Reset Hype Train** under the box ends the train and brings the cuts back. See [What prints](PRINTER_OPERATION.md#what-prints).
23. **The receipt browser rests between receipts.** Printer Bot draws every receipt in a hidden Edge. Since 3.0.0-beta.8 the browser puts the receipt away 1.5 seconds after the last one, so a receipt with a moving picture does not keep it drawing, and the browser starts below normal priority, so a stream on the same PC comes first. Receipts look as they did.
24. **Images in messages.** A viewer's message can print a picture. In the dock, in the **Advanced** card, under **Images in messages**, switch on the image sites you accept pictures from: Imgur, Catbox and ImgBB. A direct link to a picture on one of them, such as `https://i.imgur.com/<name>.png`, prints as that picture, up to three to a message. Every site is off until you switch it on, and a link from a site that is off stays text. Each printer has a switch, **Allow images**, to keep pictures off that printer. Printer Bot makes the picture itself, so a message cannot run anything, and it does not look at what a picture shows. See [Images in messages](PRINTER_OPERATION.md#images-in-messages) and [Privacy](PRIVACY.md#privacy-and-third-party-services).

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

To try the prerelease, import [import.prerelease.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/beta/import.prerelease.txt) in step 1 instead. [Prerelease versions](UPDATING.md#prerelease-versions) says what to expect.

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
| `v/` | the dock pages for Printer Bot 2.3.0 and later (`v/2.3.0/`, `v/2.4.0/`, `v/2.4.5/`, `v/2.5.0/`, `v/3.0.0-beta.1/`, `v/3.0.0-beta.2/`, `v/3.0.0-beta.3/`, `v/3.0.0-beta.4/` and `v/3.0.0-beta.5/`), one folder for each version, with its own receipt layout, signature and `version.json` |
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
