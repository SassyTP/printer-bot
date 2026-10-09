# Printer Operation

This guide covers what Printer Bot prints, the output modes, the dock's settings, printers and rules, what viewers can put on a receipt, how Printer Bot watches the print queue, how to style receipts with `theme.css` and where Printer Bot keeps its files. [Install](README.md#install) in the README comes first.

## What prints

Every event below has a trigger in the action. All triggers are on except channel point rewards. To stop printing an event, switch off its trigger in the action's trigger list.

| Platform | Receipts for |
|---|---|
| Twitch | cheers (bits), channel point rewards (off until you switch the trigger on), subscriptions and resubscriptions (a resubscription prints the total time subscribed, the current streak and the months paid in advance on a 3, 6 or 12 month plan, and a first-time subscriber shows the months paid in advance), gifted subs (a gift bomb prints one receipt that lists every recipient, however many there are), raids of 5 or more viewers (the Raid trigger's minimum, which you can change in the trigger list), Hype Trains (a receipt when a train starts, when the Bits Conductor or the Gift Sub Conductor changes, at each level up and when it ends) |
| YouTube | new members, member milestones, gifted memberships (the gifter's and each recipient's), Super Chats, Super Stickers |
| Kick | subscriptions, resubscriptions, gifted subscriptions (single and mass), raids, gifted Kicks (only gifts of type LEVEL_UP). Streamer.bot has to be logged in to Kick for any of these (see [Troubleshooting](TROUBLESHOOTING.md#nothing-from-kick-prints-even-a-test-from-streamerbot)) |
| StreamElements | tips |
| Streamlabs | donations |
| Fourthwall | donations, orders (with a total above zero, listing every item, 50 at most), memberships |

Kick raids and gifted Kicks arrive through two Streamer.bot *custom code event* triggers: `[Kick.bot] Raid` (event name `kickIncomingRaid`) and `[Kick.bot] Kicks gifted` (event name `kickKicksGifted`). They fire when a Kick integration or your own script in Streamer.bot raises those events. The **Streamer.bot Started** trigger warms up the receipt browser. Leave it on.

Each printed (or saved) receipt raises a Streamer.bot custom trigger called **Print Job Sent** (category SassyTP → Printer Bot) that other actions can react to.

**Hype Trains.** The four Hype Train triggers (Twitch → Hype Train: Start, Update, Level Up and End) are part of the import since 2.5.0. If your import is older, add them to the action by hand. **Advanced → Print Hype Trains** switches all four off, even when the triggers are in Streamer.bot. A train has two Conductors, as on Twitch: the top cheerer is the Bits Conductor and the top sub gifter is the Gift Sub Conductor. Each gets a receipt with the cap when they first appear and another when somebody takes the cap. The Level up receipt and the receipt at the end of the train list both. Streamer.bot's triggers send the level, the kind of train, the start time and the two top contributors. They send no total and no list of contributors, so Printer Bot keeps its own tally of the bits. While a train is on, each cheer it sees adds its bits to that cheerer, and Twitch's figure for the top cheerer raises that cheerer's number to Twitch's. The tally counts bits only and starts at the Start event. The figure of each Conductor always comes from Twitch. Twitch reports the Gift Sub Conductor's total in points and the receipts show gift subs: 500 points are one (a Tier 1 gift sub), so a Tier 3 gift sub counts as five. A cheer from before the train started, a Streamer.bot that was closed during the train or a missing Cheer trigger leaves those cheers out of the other numbers.

## Output

| Output | For |
|---|---|
| Thermal printer (ESC/POS) | most receipt printers, and the fastest |
| Windows printer driver | printers without ESC/POS support. It uses the printer's normal driver and is slower |
| Preview only (no printer) | trying it without a printer. Receipts are saved as PNG pictures (the newest 50 are kept) |

## The dock's settings

| Setting | What it does (default) |
|---|---|
| **Printer** | The Windows printer to use. **Auto-detect** guesses from the printer names. Hidden in *Preview only* mode. |
| **Paper width** | **80 mm** (default) or **58 mm**, printed 72 mm or 48 mm wide. |
| **Output** | See *Output* above. Default: Thermal printer (ESC/POS). |
| **Picture style** | How avatars become black and white: **Detailed** (default), **Soft** or **Crisp (no shading)**. |
| **Paper cut** | **Partial** (default), **Full** or **None**. Thermal (ESC/POS) only. |
| **Extra feed before cut** | Extra paper before the cut, in printer dots, 0 to 400 (default 80, about 10 mm). Thermal (ESC/POS) only. |
| **More printers → Add another printer** | Adds a card for printer 2, and up to printer 5. The six rows above then belong to the card of printer 1. See *Printers and rules*. From 3.0.0. |
| **High Roller (bits)** | Cheers of at least this many bits may style their message. Default 25. 0 means plain text for everyone. |
| **Ignore test triggers** | Skips "Test" and "Simulate" events from Streamer.bot. Off by default. |
| **Keep debug files** | Saves the last event and receipt picture in the data folder. Off by default. |
| **Advanced → High Roller: bits per inch** | Caps the printed length of a High Roller message. Default 0, no limit. |
| **Advanced → High Roller: maximum length** | The longest a High Roller message can print, in inches (0 to 40). It overrides *bits per inch* and applies to cheers only. Default 0, which keeps the built-in limit of about 16.7 inches. |
| **Advanced → Print Hype Trains** | Prints the Hype Train receipts. When it is off, none of the four Hype Train events print, even with their triggers in Streamer.bot. The dock's Hype Train test prints still print. On by default. From 2.5.0. |
| **Advanced → Hide links in messages** | Replaces text that looks like a web address in a normal message with [link]. Some bare domain names slip through. High Roller messages are untouched. Off by default. |
| **Advanced → Free receipts per minute** | Limits free prints. Channel point redemptions and raids count toward it. Cheers, subs, gifts and tips do not. Default 30. 0 means no limit. A warning is logged at most every 30 seconds, and the dock shows the count ("Skipped by that limit"). |
| **Advanced → Viewer pictures** | Shows how many viewers Printer Bot remembers (their picture addresses, and for two hours a name it could not find). **Clear picture cache** forgets them all, and each viewer's picture is looked up and downloaded again on their next receipt. From 2.4.5. |
| **Advanced → Customize receipts** | The last row of Advanced. Shows the folder where `theme.css` goes, relative to your Streamer.bot folder, with a **Copy folder path** button (see *How receipts look, and theme.css*). |
| **Backup** | **Save settings** writes your printers, rules and print options to a file, and **Restore settings** reads such a file back (see *Backing up your settings*). From 3.0.0-beta.1. |
| **Updates** | The Updates card holds **Install updates automatically**, **Try prerelease versions**, **Download updates (layouts and program updates)**, **Renderer updates** and **Renderer**. [Updating](UPDATING.md#settings-in-the-updates-card) describes each. Both of the first two are off until you switch them on. |

The dock calls the receipt layout the "renderer".

**Without the dock.** Printer Bot works with the defaults above (Thermal printer output, Auto-detect, 80 mm). If Auto-detect does not find your printer, or you want another setting, edit `settings.json` in the data folder. In the dock's words:

- `mode` `escpos` is *Thermal printer (ESC/POS)*, `windows` is *Windows printer driver* and `png` is *Preview only*.
- `dither` `floyd` is *Detailed*, `atkinson` is *Soft* and `threshold` is *Crisp (no shading)*.
- `cut` is `partial`, `full` or `none`, `paperWidthMm` is 80 or 58 and `printer` is the exact Windows printer name.
- `allowHostedUpdates` (`true` or `false`) is *Download updates (layouts and program updates)*. Write it as a plain `true` or `false` without quotes. The updater treats any other value as off.
- `autoUpdateCore` (`true` or `false`) is *Install updates automatically*. The default is `false`.
- `prereleaseUpdates` (`true` or `false`) is *Try prerelease versions*. The default is `false`. Write it as a plain `true` or `false` without quotes. The updater treats any other value as off.
- The other keys are `feedDots`, `highRollerBits`, `highRollerBitsPerInch`, `highRollerMaxInches`, `freePrintsPerMinute`, `hideLinks`, `ignoreTestTriggers`, `keepDebugFiles` and `hypeTrain`.
- `printer`, `paperWidthMm`, `mode`, `dither`, `cut` and `feedDots` at the top of the file are printer 1. `extraPrinters` lists printers 2 to 5, each with the same six keys, and `routing` holds `routeAllElse` (the number of the printer for everything else) and `rules`. A rule looks like `{ "to": 3, "trigger": "TwitchCheer", "when": [ { "field": "bits", "op": "<=", "value": "500" } ] }`. The values of `op` are `=`, `!=`, `>`, `>=`, `<` and `<=` for numbers, `is`, `isnot`, `contains`, `notcontains`, `starts`, `ends`, `empty` and `notempty` for text, and `yes` and `no` for yes/no values. A rule that cannot be read is removed when the file loads, and the log names it. With no entry in `extraPrinters` the rules are not read.

`rendererUrl` holds where layout updates and program updates come from. Change it only as [Dock Selection](DOCK_SELECTION.md#how-updates-find-your-dock) describes. It must be the dock folder's full address ending with `/`, for example `https://dock.example.com/printer-bot/`. Otherwise the last part is taken for a file name and dropped. An unusable value is cleared, and the next dock that connects sets it again.

Close Streamer.bot before editing the file. Printer Bot reads it only at startup, and an edit made while it runs is lost if the dock saves a setting first.

**Auto-detect** guesses from printer names. In thermal (ESC/POS) mode it accepts only receipt-looking names (receipt, thermal, RONGTA, Epson TM, Star, Xprinter, POS), because raw printer commands sent to an office printer print pages of garbage. In the other modes it skips virtual printers (PDF, XPS, Fax, OneNote) and prefers a receipt-looking name. A printer you pick is used as long as it is installed, so pick a receipt printer.

**Test print** offers twenty-three samples for Twitch, YouTube and Kick. **TwitchReSub** shows a resubscription with all three lines: 8 months in total, a streak of 5 months and 6 months paid in advance. **TwitchCheerLong** (60 lines, a lot of paper) is a 100-bit cheer, or as many bits as your High Roller threshold if that is higher, for trying out *bits per inch*. With the threshold at 0 it prints as plain text. **TwitchGiftBomb** lists 50 recipients, one to a line (about 40 cm of paper). **TwitchGiftBombBig** lists 500 (about 3 m of paper) and shows that a long list prints in full. It counts as ten of the 20 test prints a minute that the dock allows. Streamer.bot's own Test button sends sparse events, for example a gift bomb with no names and a YouTube member with no level name, so use these samples to see a full receipt. The Hype Train samples are the six receipts of a train (**TwitchHypeTrainStart**, **TwitchHypeTrainConductor** for the first Bits Conductor, **TwitchHypeTrainConductorSwitch** for a new Bits Conductor, **TwitchHypeTrainSubConductor** for the Gift Sub Conductor, **TwitchHypeTrainLevelUp**, **TwitchHypeTrainEnd**) and **TwitchHypeTrainEndToEnd**, which prints all six in a row. Hype Train samples keep their own tally and leave a running train alone. The Start sample shows the Normal, the Treasure and the Golden Kappa train in turn, and the other steps use the kind it showed last.

## Printers and rules

Printer Bot prints on one printer until you add another. **Add another printer** (in Settings, under the rows of printer 1) makes a card for printer 2, and the dock adds printers up to five. Printer 1 keeps the settings it always had, and its rows move into its card. Every printer has its own **Printer**, **Paper width**, **Output**, **Picture style**, **Paper cut** and **Extra feed before cut** (the last two for the thermal output) under *Paper and output*. A new printer starts with a copy of the settings of printer 1 and no printer chosen, and takes no receipts until you choose one. A printer whose output is *Preview only* needs none, because it saves a picture and has nothing to send to. Only printer 1 can use Auto-detect. Printers 2 to 5 are chosen by name, and a printer that one card uses cannot be chosen on another. A printer that was removed from Windows is not replaced by another one. Its receipts fail, the log and the dock say so, and the other printers go on.

**Which printer prints what.** Each card has a list of rules under **Prints these events**. A rule has:

- **A trigger.** One kind of event, such as *Twitch: Cheer* or *YouTube: Super Chat*, or a family such as *Any Twitch event*. The list holds every kind of event that Printer Bot prints (29, counting the two Kick helpers).
- **Tests, if you want them.** Each test compares one parameter that Streamer.bot sends with that trigger to a value. The parameters are the variables Streamer.bot lists for the trigger, for example **Bits** for a cheer, **Tier** for a subscription and **Viewers in the raid** for a raid. **Other parameter...** takes the name of any variable. A family has no tests.

A rule passes when the event is of its trigger and all of its tests pass. A printer prints an event when the event passes at least one of its rules. So several rules on one card mean "or", and the tests inside one rule mean "and". An event that passes rules on two printers prints on both of them, one receipt each. One printer takes an event that passes no rule at all. Turn on the switch **Use this printer for everything else** at the foot of its card, or choose the printer in the list **Everything else prints on** under the cards. Both show the same pick, and one printer has it at a time: turning the switch on for a printer turns it off for the one that had it. The switch that is on cannot be turned off, so turn another one on to move it. It is printer 1 until you pick another. A printer that is not set up cannot be picked. If the printer you picked loses its setup, the pick stays, the dock says so on the card and under the list, and everything else prints on printer 1 until you choose a printer for it.

For example, with printers 1 and 3: the rule *Twitch: Cheer where Bits is greater than 500* on printer 1 and *Twitch: Cheer where Bits is at most 500* on printer 3. A cheer of 600 bits prints on printer 1, a cheer of 500 bits prints on printer 3, and a raid, which no rule names, prints on printer 1 because it is the printer for everything else.

| Kind of parameter | The tests |
|---|---|
| number | equals, does not equal, is greater than, is at least, is less than, is at most |
| text | is, is not, contains, does not contain, starts with, ends with, is empty, is not empty (capitals do not matter) |
| yes or no | is yes, is no |

A number that Streamer.bot sends as text still counts as a number. A parameter that is missing from an event, or that cannot be read, fails every number test. A text test reads it as empty text, and a yes/no test reads it as no. A test that needs a value passes nothing until it has one. Amounts of money are compared as numbers in the currency the service sends, with no conversion. The amount of a YouTube Super Chat is typed in whole units (20 for 20 dollars), and Printer Bot compares it with the amount Streamer.bot sends in millionths.

**While you edit.** A rule is saved when it is complete. A new rule has no trigger and is saved when you pick one (from then on it prints every event of that trigger, until you add tests). A rule that you change keeps its last complete version in force until the change is complete, and the line under the rule says what is missing. Removing a printer removes its rules, and the printers after it move up one number. Removing the last extra printer returns to one printer and removes the rules.

**Limits.** Five printers, 30 rules in all, four tests in a rule and 48 characters in a value.

**Checking a rule.** **Test print** has a row **Print on** with each printer and **All printers**. **Check where an event prints** (in Settings, under the cards) takes a trigger and the values you type for the parameters that your rules test. It says which printers such an event would print on and which rules it passes. It prints nothing. The Streamer.bot log also says where each event goes, in a line such as `TwitchCheer goes to printer 1 (rule 2).`

**Paper.** Every printer prints a receipt of its own, drawn for its paper width. An event that prints on three printers counts three times toward **Free receipts per minute** (when it is a free event), and a test print on three printers counts three times toward the 20 test prints a minute. In *Preview only* mode the pictures of printers 2 to 5 end in `_p2` to `_p5`.

## Backing up your settings

Printer Bot keeps your settings in `settings.json` in its data folder (see [Where Printer Bot keeps its files](#where-printer-bot-keeps-its-files)). If Streamer.bot loses that folder, or you set Printer Bot up on a new PC, the printers and rules are gone with it. The **Backup** card of the dock saves them with one click. It is there from 3.0.0-beta.1.

- **Save settings.** One click sends a file named like `printer-bot-settings-2026-10-09.json` (with the date of the day) to the downloads of your browser. Keep it somewhere safe, with your other backups. The file is plain text. It holds your printers, your routing rules and the print options: paper width, output, picture style, paper cut, extra feed, High Roller, free receipts per minute, links, Hype Trains, test triggers and debug files. It holds no password and no web address.
- **Restore settings.** Click it and choose a file made by **Save settings**. The dock shows what the file holds: when it was saved, by which version, how many printers and routing rules. Nothing changes until you press **Restore these settings**. Printer Bot then replaces those settings, and the dock says "Settings restored." Printer Bot limits some numbers and it removes a rule that names a printer your setup does not have. If it kept a different value for something, the dock lists what differs, and the Streamer.bot log says why.
- **The update switches are not in the file.** **Download updates**, **Install updates automatically** and **Try prerelease versions** stay as you set them in the Updates card. Restoring a file never changes them, so a file from another person cannot start a download or an install.
- **When the dock cannot save or open files.** Some OBS docks cannot download or open files. Open **Settings as text** in the Backup card. **Show settings as text** and **Copy the text** give you the same content as text that you can keep in a note. To restore, paste the text into the box, press **Check the pasted text** and then **Restore these settings**.

After a restore on a new PC, look at the printer names. A file made on another PC names the printers that PC had, and the dock marks a printer that is not installed here.

## What viewers can put on a receipt

- Normal messages print as plain text, so markup shows up literally. They are cut at 500 characters and are not moderated. Twitch AutoMod and Streamer.bot's own filters are the only filters.
- A cheer of at least the **High Roller (bits)** threshold may style its message with HTML: bold, colours, sizes, rotated text, text that stays on one line (`white-space: nowrap`), tables, and Twitch, Kick, BTTV, 7TV and FFZ emotes. Printer Bot removes these from every message, High Roller or not: clickable links, scripts, event handlers, forms, frames, `<style>`, `<link>`, `<meta>`, SVG, CSS that loads anything, and images from any other site. A web address typed as plain text still prints as text. Allowed HTML can still look ugly or obnoxious, so set the threshold as high as you are comfortable with.
- A High Roller message is cut at 4000 characters of HTML and 400 elements or pieces of text. Its pictures are limited to 64 pixels (about 17 mm). A receipt with a viewer's message in it stays under about 1.3 m of paper. Gift sub lists have no limit, because one receipt lists every recipient, and neither has the item list of a Fourthwall order (50 items at most), because every paid item has to print. Names are cleaned of invisible and text-direction characters and cut at 48 characters. A name or word that is wider than the line is broken where the line ends, so a long name keeps its ending on the paper.
- *Bits per inch* limits a High Roller message to *bits ÷ this number* inches. At `10`, a 100-bit cheer gets up to 10 inches and a 25-bit cheer up to 2.5 (decimals such as `2.5` work, and `0` means no limit of its own). Longer messages fade out at the limit, and the Streamer.bot log notes how much was cut. Avatars, names, logos, dates and normal messages have no limit. With no *maximum length* (next bullet), a message prints at most about 16.7 inches, whatever the setting.
- *Maximum length* sets the final limit on a High Roller message. It prints at most this many inches (up to 40), whatever *bits per inch* says. Setting it also replaces the built-in 16.7 inch limit, so `30` allows messages up to 30 inches. It applies to cheers only and leaves gift sub lists and every other receipt at full length.
- A Fourthwall order or donation that arrives without a user name, or with one that shows as nothing (only joiners, combining marks or blank Braille characters), prints **Anonymous supporter**. The buyer's e-mail address is never shown.

When something that matters is removed from a message, the Streamer.bot log says who sent it.

## Keeping an eye on the printer

Before each receipt, the action asks Windows whether the print queue can print and whether jobs are stuck. The dock's **Print queue** row shows the answer, and the Streamer.bot log reports it once per change when the queue shows an error or stuck jobs.

A printer that is off or unplugged prints an accepted job when it comes back. Windows reports what the driver tells it, and some drivers cannot report that the paper has run out. With more than one printer the dock's status card has a row for each printer, and the status line names the first printer that cannot print.

If no printer can be found or opened, or the spooler is not running, the receipt is logged as "Print failed" and shown in the dock. Printer Bot does not retry it.

If the printer you chose for printer 1 was removed or renamed, Printer Bot warns in the Streamer.bot log and the dock's **Note** row, then prints on whichever printer Auto-detect picks (in *Windows printer driver* mode, any non-virtual printer). The **Note** row also says when no receipt printer was found. Check it if receipts come out in the wrong place. Printers 2 to 5 have no Auto-detect, so one of them that was removed prints nothing and says so.

## How receipts look, and theme.css

Receipts use one typeface (Segoe UI) in two weights: bold for titles, names and amounts, regular for everything else. Only High Roller messages can use italics. Everything is black on white. A black Twitch, YouTube or Kick logo sits at the bottom where the platform has one, followed by a short date in your computer's language and 12/24-hour style. The profile picture is at the top, 390 dots (about 49 mm) wide on 80 mm paper, and shrinks on narrower paper.

To change the look, put CSS in `theme.css` in the data folder (**Advanced → Customize receipts** in the dock shows the folder, relative to your Streamer.bot folder, and has a **Copy folder path** button). It applies on the next print with no restart. For example:

```css
#receipt-icon { height: 2em; }       /* smaller platform logo */
#receipt-icon { display: none; }     /* no platform logo */
#receipt-avatar { display: none; }   /* no profile picture, which leaves no margin above the first line. Add #receipt-container { padding-top: 16px; } for one */
```

You can style `#receipt-container`, `#receipt-avatar`, `#receipt-title` (with `.big` for amounts), `#receipt-subtitle`, `#receipt-content` (its blocks have class `.part`), `#receipt-icon` and `#receipt-date`. A receipt without a picture has `.no-avatar` on `#receipt-container`. On 80 mm paper the receipt page is 272 pixels wide (181 on 58 mm paper).

**Avoid `vh` units, `height: 100%` and `min-height: 100vh`.** The receipt is laid out in a window that is always 5,000 pixels tall, so those make every receipt about 1.3 m long.

## Where Printer Bot keeps its files

The first time it runs, Printer Bot creates its own data folder, `<Streamer.bot>\SassyTP\printer-bot\` (`<Streamer.bot>` is your Streamer.bot folder), and keeps what it writes there.

| File or folder | What it is |
|---|---|
| `settings.json` | your settings (made by Printer Bot, changed from the dock or by hand) |
| `theme.css` | optional, yours: restyles receipts |
| `receipts\` | the pictures saved in *Preview only* mode (those of printers 2 to 5 end in `_p2` to `_p5`) |
| `avatars.json` | remembered profile-picture addresses (viewer names and picture addresses), and the names a lookup could not find, kept for two hours. **Advanced → Clear picture cache** empties it |
| `renderer.html`, `renderer.html.sig` | a downloaded receipt layout and its signature, once verified and used |
| `renderer.rejected` | the number of a downloaded layout that did not start |
| `core\api1\` | program updates and the updater's notes: a folder for the downloaded version that runs and one for the version before it. Small files record which version runs, which came before, which versions you went back from and how often a version was running when Streamer.bot ended before it had settled in. Its `backup\` folder keeps the last three copies of `settings.json`, made before a new version starts for the first time. |
| `settings.json.bad` | a copy of an unreadable `settings.json` (Printer Bot then uses the defaults) |
| `last_event.json`, `last_receipt.png` | only with **Keep debug files** on (they contain viewer names and messages) |

The hidden Edge keeps its own profile in `%LOCALAPPDATA%\SassyTP\printer-bot\edge-cdp-profile-v4`. An Edge process with no window in Task Manager is Printer Bot's receipt browser. It may outlive Streamer.bot and is safe to end. Printer Bot starts a new one when needed.
