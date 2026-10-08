# Printer Operation

This guide covers what Printer Bot prints, the output modes, the dock's settings, what viewers can put on a receipt, how Printer Bot watches the print queue, how to style receipts with `theme.css` and where Printer Bot keeps its files. [Install](README.md#install) in the README comes first.

## What prints

Every event below has a trigger in the action. All triggers are on except channel point rewards. To stop printing an event, switch off its trigger in the action's trigger list.

| Platform | Receipts for |
|---|---|
| Twitch | cheers (bits), channel point rewards (off until you switch the trigger on), subscriptions and resubscriptions (a line says how many months were paid ahead on a 3, 6 or 12 month plan), gifted subs (a gift bomb prints one receipt that lists every recipient, however many there are), raids of 5 or more viewers (the Raid trigger's minimum, which you can change in the trigger list), Hype Trains (a receipt when a train starts, when the Conductor changes, at each level up and when it ends) |
| YouTube | new members, member milestones, gifted memberships (the gifter's and each recipient's), Super Chats, Super Stickers |
| Kick | subscriptions, resubscriptions, gifted subscriptions (single and mass), raids, gifted Kicks (only gifts of type LEVEL_UP). Streamer.bot has to be logged in to Kick for any of these (see [Troubleshooting](TROUBLESHOOTING.md#nothing-from-kick-prints-even-a-test-from-streamerbot)) |
| StreamElements | tips |
| Streamlabs | donations |
| Fourthwall | donations, orders (with a total above zero), memberships |

Kick raids and gifted Kicks arrive through two Streamer.bot *custom code event* triggers: `[Kick.bot] Raid` (event name `kickIncomingRaid`) and `[Kick.bot] Kicks gifted` (event name `kickKicksGifted`). They fire when a Kick integration or your own script in Streamer.bot raises those events. The **Streamer.bot Started** trigger warms up the receipt browser. Leave it on.

Each printed (or saved) receipt raises a Streamer.bot custom trigger called **Print Job Sent** (category SassyTP → Printer Bot) that other actions can react to.

**Hype Trains.** The four Hype Train triggers (Twitch → Hype Train: Start, Update, Level Up and End) are part of the import since 2.5.0. If your import is older, add them to the action by hand. **Advanced → Print Hype Trains** switches all four off, even when the triggers are in Streamer.bot. Streamer.bot's triggers send the level, the kind of train, the start time and the top cheerer. They send no total and no list of contributors, so Printer Bot keeps its own tally. While a train is on, each cheer it sees adds its bits to that cheerer, and Twitch's figure for the top cheerer raises that cheerer's number to Twitch's. The tally counts bits only and starts at the Start event. The Conductor's figure always comes from Twitch. A cheer from before the train started, a Streamer.bot that was closed during the train or a missing Cheer trigger leaves those cheers out of the other numbers.

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
| **Updates** | The Updates card holds **Install updates automatically**, **Download updates (layouts and program updates)**, **Renderer updates** and **Renderer**. [Updating](UPDATING.md#settings-in-the-updates-card) describes each. |

The dock calls the receipt layout the "renderer".

**Without the dock.** Printer Bot works with the defaults above (Thermal printer output, Auto-detect, 80 mm). If Auto-detect does not find your printer, or you want another setting, edit `settings.json` in the data folder. In the dock's words:

- `mode` `escpos` is *Thermal printer (ESC/POS)*, `windows` is *Windows printer driver* and `png` is *Preview only*.
- `dither` `floyd` is *Detailed*, `atkinson` is *Soft* and `threshold` is *Crisp (no shading)*.
- `cut` is `partial`, `full` or `none`, `paperWidthMm` is 80 or 58 and `printer` is the exact Windows printer name.
- `allowHostedUpdates` (`true` or `false`) is *Download updates (layouts and program updates)*. Write it as a plain `true` or `false` without quotes. The updater treats any other value as off.
- `autoUpdateCore` (`true` or `false`) is *Install updates automatically*. The default is `false`.
- The other keys are `feedDots`, `highRollerBits`, `highRollerBitsPerInch`, `highRollerMaxInches`, `freePrintsPerMinute`, `hideLinks`, `ignoreTestTriggers`, `keepDebugFiles` and `hypeTrain`.

`rendererUrl` holds where layout updates and program updates come from. Change it only as [Dock Selection](DOCK_SELECTION.md#how-updates-find-your-dock) describes. It must be the dock folder's full address ending with `/`, for example `https://dock.example.com/printer-bot/`. Otherwise the last part is taken for a file name and dropped. An unusable value is cleared, and the next dock that connects sets it again.

Close Streamer.bot before editing the file. Printer Bot reads it only at startup, and an edit made while it runs is lost if the dock saves a setting first.

**Auto-detect** guesses from printer names. In thermal (ESC/POS) mode it accepts only receipt-looking names (receipt, thermal, RONGTA, Epson TM, Star, Xprinter, POS), because raw printer commands sent to an office printer print pages of garbage. In the other modes it skips virtual printers (PDF, XPS, Fax, OneNote) and prefers a receipt-looking name. A printer you pick is used as long as it is installed, so pick a receipt printer.

**Test print** offers twenty-two samples for Twitch, YouTube and Kick. **TwitchReSub** shows a resubscription with six months paid ahead. **TwitchCheerLong** (60 lines, a lot of paper) is a 100-bit cheer, or as many bits as your High Roller threshold if that is higher, for trying out *bits per inch*. With the threshold at 0 it prints as plain text. **TwitchGiftBomb** lists 50 recipients, one to a line (about 40 cm of paper). **TwitchGiftBombBig** lists 500 (about 3 m of paper) and shows that a long list prints in full. It counts as ten of the 20 test prints a minute that the dock allows. Streamer.bot's own Test button sends sparse events, for example a gift bomb with no names and a YouTube member with no level name, so use these samples to see a full receipt. The Hype Train samples are the five receipts of a train (**TwitchHypeTrainStart**, **TwitchHypeTrainConductor**, **TwitchHypeTrainConductorSwitch**, **TwitchHypeTrainLevelUp**, **TwitchHypeTrainEnd**) and **TwitchHypeTrainEndToEnd**, which prints all five in a row. Hype Train samples keep their own tally and leave a running train alone. The Start sample shows the Normal, the Treasure and the Golden Kappa train in turn, and the other steps use the kind it showed last.

## What viewers can put on a receipt

- Normal messages print as plain text, so markup shows up literally. They are cut at 500 characters and are not moderated. Twitch AutoMod and Streamer.bot's own filters are the only filters.
- A cheer of at least the **High Roller (bits)** threshold may style its message with HTML: bold, colours, sizes, rotated text, text that stays on one line (`white-space: nowrap`), tables, and Twitch, Kick, BTTV, 7TV and FFZ emotes. Printer Bot removes these from every message, High Roller or not: clickable links, scripts, event handlers, forms, frames, `<style>`, `<link>`, `<meta>`, SVG, CSS that loads anything, and images from any other site. A web address typed as plain text still prints as text. Allowed HTML can still look ugly or obnoxious, so set the threshold as high as you are comfortable with.
- A High Roller message is cut at 4000 characters of HTML and 400 elements or pieces of text. Its pictures are limited to 64 pixels (about 17 mm). A receipt with a viewer's message in it stays under about 1.3 m of paper. Gift sub lists have no limit, because one receipt lists every recipient. Names are cleaned of invisible and text-direction characters and cut at 48 characters.
- *Bits per inch* limits a High Roller message to *bits ÷ this number* inches. At `10`, a 100-bit cheer gets up to 10 inches and a 25-bit cheer up to 2.5 (decimals such as `2.5` work, and `0` means no limit of its own). Longer messages fade out at the limit, and the Streamer.bot log notes how much was cut. Avatars, names, logos, dates and normal messages have no limit. With no *maximum length* (next bullet), a message prints at most about 16.7 inches, whatever the setting.
- *Maximum length* sets the final limit on a High Roller message. It prints at most this many inches (up to 40), whatever *bits per inch* says. Setting it also replaces the built-in 16.7 inch limit, so `30` allows messages up to 30 inches. It applies to cheers only and leaves gift sub lists and every other receipt at full length.
- A Fourthwall order or donation that arrives without a user name prints **Anonymous supporter**. The buyer's e-mail address is never shown.

When something that matters is removed from a message, the Streamer.bot log says who sent it.

## Keeping an eye on the printer

Before each receipt, the action asks Windows whether the print queue can print and whether jobs are stuck. The dock's **Print queue** row shows the answer, and the Streamer.bot log reports it once per change when the queue shows an error or stuck jobs.

A printer that is off or unplugged prints an accepted job when it comes back. Windows reports what the driver tells it, and some drivers cannot report that the paper has run out.

If no printer can be found or opened, or the spooler is not running, the receipt is logged as "Print failed" and shown in the dock. Printer Bot does not retry it.

If the printer you chose was removed or renamed, Printer Bot warns in the Streamer.bot log and the dock's **Note** row, then prints on whichever printer Auto-detect picks (in *Windows printer driver* mode, any non-virtual printer). The **Note** row also says when no receipt printer was found. Check it if receipts come out in the wrong place.

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
| `receipts\` | the pictures saved in *Preview only* mode |
| `avatars.json` | remembered profile-picture addresses (viewer names and picture addresses), and the names a lookup could not find, kept for two hours. **Advanced → Clear picture cache** empties it |
| `renderer.html`, `renderer.html.sig` | a downloaded receipt layout and its signature, once verified and used |
| `renderer.rejected` | the number of a downloaded layout that did not start |
| `core\api1\` | program updates and the updater's notes: a folder for the downloaded version that runs and one for the version before it. Small files record which version runs, which came before, which versions you went back from and how often a version was running when Streamer.bot ended before it had settled in. Its `backup\` folder keeps the last three copies of `settings.json`, made before a new version starts for the first time. |
| `settings.json.bad` | a copy of an unreadable `settings.json` (Printer Bot then uses the defaults) |
| `last_event.json`, `last_receipt.png` | only with **Keep debug files** on (they contain viewer names and messages) |

The hidden Edge keeps its own profile in `%LOCALAPPDATA%\SassyTP\printer-bot\edge-cdp-profile-v4`. An Edge process with no window in Task Manager is Printer Bot's receipt browser. It may outlive Streamer.bot and is safe to end. Printer Bot starts a new one when needed.
