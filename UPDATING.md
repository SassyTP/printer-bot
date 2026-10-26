# Updating

This repository's [Releases](https://github.com/SassyTP/printer-bot/releases) page lists what changed in each version. Printer Bot 3.0.0 and newer update from the dock. Versions older than 3.0.0 are no longer supported (see [From a version older than 3.0.0](#from-a-version-older-than-300)).

## Update from the dock

The dock shows its cards in this order: the status, **Settings** (with the printers and the **Rules**), **Test**, **Backup** and **Updates**. The **Updates** card is the last one and starts closed. Click its title to open it. While it is closed, the line after the title says what needs attention, and the dock remembers whether you left it open. The card shows the version that runs ("3.2.0 (built in)", or "(downloaded)" after an update), the updater's number and when Printer Bot last checked. **Check now** next to *Last checked* looks for a program update. **Check layouts** under *Renderer updates*, lower in the card, looks for a new receipt layout.

- **How it checks.** Printer Bot asks the dock's web host whether a newer program exists. It asks:
  - when a dock connects (at most once every 15 minutes, and sooner when the update source changed),
  - about a minute after Printer Bot's code starts in Streamer.bot (skipped when the last check is less than six hours old),
  - every six hours after that,
  - when you press **Check now** (at most once every 20 seconds).

  It needs to know where updates come from, so open the dock from its web address once and let it connect. Until Printer Bot has asked once since its code started, the card says "Checking soon." It says the same after you switch **Download updates** on again, until the next check answers. When Streamer.bot loads Printer Bot's code again while the dock is open (it does that after a quiet spell), the card keeps what it showed until Printer Bot answers the dock the next time. If that answer says it has not checked yet, the card says "Checking soon." and the dock asks for a check automatically, at most once a minute. **Check now** asks at once.
- **Update available.** The card says "Update available: 3.2.1", lists "What's new" as the author wrote it, and shows **Update to 3.2.1**. A small blue dot also appears at the top of the dock, next to the connection icon. Clicking the dot jumps to the card.
- **Two clicks.** Press **Update to 3.2.1**. The button changes to "Update now? Click again". Press it again within 5 seconds. The first click starts nothing, and the second click names the version you saw. Printer Bot then asks the host for the signed list once more, so an install never rests on an old answer. If the author published a newer version in between, the card shows the new version and its notes and installs nothing. An update whose signing key was revoked by then is refused.
- **What you see.** The card goes through "Downloading 3.2.1…" with a percentage, "Checking the download of 3.2.1…", "Waiting for a receipt to finish…" (only if one is printing), "Switching to 3.2.1…" and "Updated to 3.2.1." Then press **Reload dock**: the launcher shows the matching dock page if there is another one. Streamer.bot needs no restart, because the update switches the program while Streamer.bot runs. The button goes away once the dock has reloaded (the dock page of 3.0.0 also says "Restart Streamer.bot first. Then press Reload dock, so the update takes properly." until the next check for updates; you can skip that restart). From 3.2.0 the dock also says it at its very top, above everything else, and only while it is needed. After an update it says *Printer Bot was updated to <version>. Press Reload dock to open the dock page of the new version. Streamer.bot needs no restart.* until the dock has reloaded. An update that needs a restart of Streamer.bot (none has so far) says instead, at the same place, *Printer Bot was updated to <version>. Restart Streamer.bot now: this update needs it to work properly. Then press Reload dock.*, and that notice stays until Streamer.bot has been restarted.
- **A receipt that is printing.** An update waits for a printing receipt to finish, 15 seconds at a time, and tries again every 30 seconds. It gives up after several minutes with "Printer Bot is busy with a receipt. Try again in a moment." A long list, such as a huge gift bomb, can make it wait longer. Events that arrive while the new version starts wait for the switch and then print. The first receipt after an update can take a moment longer.
- **If it fails.** The old version keeps running. The card says "The update did not work." with the reason and "Nothing changed. The previous version keeps running." After a failure Printer Bot waits a minute before it tries again, and it allows three tries an hour. A click on **Update** inside that minute, or after the third try, starts nothing. The red box keeps the reason of the failure, and a short note under the button says "Printer Bot tried this a moment ago. Wait a minute, then try again." The note goes away within about 15 seconds.
- **If a new version won't start.** Printer Bot goes back to the version that ran before, which is the built-in one when there is no other. The card says "The new version did not start, so the old one is running again. Printer Bot is running 3.2.0 (built in)." (with your own version numbers). The card offers the new version again, and a click tries it again. A version that only started too slowly is dropped and can be installed again the same way. When Streamer.bot ends before a new version has settled in (a crash, a power loss, a killed task), Printer Bot starts that version again at the next start. When that happens twice in a row, Printer Bot pauses the version. The built-in version runs, the log says so, and the card offers the version again with a **Try 3.2.1 again** button (with the number of that version). [When an update does not work](#when-an-update-does-not-work) has the way out.
- **If a downloaded version stops working.** A downloaded version that raises three load errors in a minute (its own files are broken or a part is missing) is dropped. Printer Bot goes back to the built-in version. The card says "Printer Bot went back to the built-in version." in amber, with "Version 3.2.1 stopped working, so Printer Bot paused it." That version is paused. The card offers it again with a **Try 3.2.1 again** button.

## Update to 3.2.1

3.2.1 needs no new import for a Printer Bot that is 3.0.0 or newer. Your settings stay in their own folder.

1. Open the Updates card of the dock and press **Check now**. The card says "Update available: 3.2.1".
2. Press **Update to 3.2.1**. The button changes to "Update now? Click again". Press it again within 5 seconds.
3. When the card says "Updated to 3.2.1.", press **Reload dock**. Streamer.bot needs no restart. The dock opens the page of 3.2.1.

Everything prints as it did until you choose something new. Coming from a version older than 3.2.0, your rules move into the **Rules** section with their printers and their order, and **Do not stop at first match** is on after the update, so every rule is read as before. A Printer Bot on a prerelease of 3.2.0 (3.2.0-beta.1 to 3.2.0-beta.9) is offered 3.2.1 too, with **Try prerelease versions** on or off, because a release is above those prereleases.

## From a version older than 3.0.0

Printer Bot versions older than 3.0.0 are no longer supported, and the dock pages made for them are gone: the dock shows them the page of 3.0.0, which says that the action is older than the dock. A Printer Bot from 2.5.0 on is still offered 3.2.1 in its Updates card (see [Update to 3.2.1](#update-to-321)). Any older one imports 3.2.1 once:

1. Copy the import code as in step 1 of [Install](README.md#install).
2. In Streamer.bot, delete the old **Printer Bot** action.
3. Import the new code as in step 1. An import creates the triggers again, so switch **Channel Reward** on again if you use it.
4. Reload the dock.

Your settings stay in their own folder, and settings from 2.x load as printer 1 with no rules. If you host your own dock, upload its files again too (see [Dock Selection](DOCK_SELECTION.md)). Until you import, the dock shows the bar described under [A later change to the import](#a-later-change-to-the-import).

## Install updates automatically

The switch **Install updates automatically** in the Updates card is off by default. Printer Bot never switches it on by itself. A new version, a new import and **Restore settings** leave it as you set it. With it on, Printer Bot installs an update automatically only when all of these hold:

- **Download updates (layouts and program updates)** in the Updates card is on.
- It found a newer update that the author signed. The author can mark an update so that it always needs your click, and then it is never installed automatically.
- The update is a release. A prerelease is never installed automatically (see [Prerelease versions](#prerelease-versions)).
- No event and no dock command reached Printer Bot for at least two minutes (the buttons of the Updates card do not count).
- Nothing was installed or tried in the last 24 hours.
- You did not go back from that version or pick the built-in version.
- Printer Bot did not pause that version after a failed start or two crashes in a row.

Right before it installs, Printer Bot checks once more that both switches are still on and that you have not gone back from that version or picked the built-in one. It writes one line in the Streamer.bot log, `[Printer Bot] Installing update 3.2.1 automatically (you switched this on in the dock).`, and the card shows "Installing automatically." and afterwards "Installed automatically at" the time. Without a dock, set `autoUpdateCore` to `true` in `settings.json` (see **Without the dock** in [The dock's settings](PRINTER_OPERATION.md#the-docks-settings)).

## Prerelease versions

A prerelease is a test version of the next release, with a number like 3.3.0-beta.1. The author publishes prereleases next to the releases, so that anyone who wants to can try a version early. A prerelease can have mistakes. Choosing one is up to you. Printer Bot offers no prerelease until you ask for it, and it never installs one by itself.

**Trying a prerelease.** Open the Updates card, switch on **Try prerelease versions**, and a moment later the card says "Update available: <version> (prerelease)" when a prerelease newer than your version is out. Press **Update to <version> (prerelease)** twice and press **Reload dock**. A note at the top of the dock says "Prerelease <version>. This is a test version of Printer Bot and it can have mistakes." Your settings stay. When the notes of a prerelease say that it needs a new import, import its code once, [import.prerelease.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/master/import.prerelease.txt), as in [A later change to the import](#a-later-change-to-the-import). That file holds the newest prerelease, which between a release and the next prerelease is older than the release: do not import it then.

The prereleases of 3.2.0 were 3.2.0-beta.1 to 3.2.0-beta.9. A Printer Bot on one of them is offered the newest release, 3.2.1, and installs it with no import.

The first prerelease of 3.3.0 is 3.3.0-beta.1: the print queue (see [The print queue](PRINTER_OPERATION.md#the-print-queue)). It needs no new import from 2.5.0 on. Receipts that wait in its print queue stay in the folder `outbox` if you go back to 3.2.1, which does not read them: they print once you are on 3.3.0-beta.1 or newer again, or you discard them there. 3.3.0-beta.2 fixes its print queue when Streamer.bot runs two copies of the action's code, as it does when it starts (the dock showed receipts as waiting after they had printed, and **Try again** did nothing), and needs no new import either. After the update to it, restart Streamer.bot once, as the dock asks: the update reaches only the copy of the action's code that got your click, and the other copy keeps the version before until Streamer.bot starts again. 3.3.0-beta.3 counts a receipt that a printer took just as it was turned off as waiting until the printer prints again (the dock showed one receipt fewer than printed), and lets a printer's **Needs attention** go by itself once the printer works again (it stayed until the dock was reloaded). It needs no new import, and asks for the same one restart after the update. 3.3.0-beta.4 lets you choose the size of the print queue, from 0 MB (the queue off) to 100 GB, under **Advanced**, **All platforms** (it was 1 GB), and the line *Last print failed* of a test print that was not sent because receipts waited goes by itself once they have printed. It needs no new import, and asks for the same one restart; then reload the dock for its new page.

**From one prerelease to the next.** No import is needed unless the notes of that prerelease say so: a prerelease whose import has not changed has the same triggers, the same keys and the same updater as the one before, and a program update replaces the rest. If you host your own dock, upload its files again first (see [Dock Selection](DOCK_SELECTION.md#host-it-yourself)).

**The switch Try prerelease versions.** While it is off, Printer Bot offers releases only. Switch it on and Printer Bot also looks at the prereleases the author publishes. It offers the highest version of the two lists, and a release is higher than its own prereleases. So 3.2.0 is higher than 3.2.0-beta.9, 3.2.0-beta.9 is higher than 3.2.0-beta.8, and 3.2.0-beta.1 is higher than 3.1.1. You install the offer with the two clicks of the **Update** button, as for any update. The card and the button say "prerelease" next to its number. Printer Bot checks again by itself a moment after you flip the switch, so the card shows what the change brings.

The switch needs revision 3 of the updater. The **Updater** row of the Updates card says "1 (revision 3)" when you have it. Every import from 3.0.0 on has it; an import of 2.5.x that was updated to 3.x from the dock does not. With an older updater the switch is greyed out and the card says that the updater is older than the setting needs. Import Printer Bot once more to get the newer updater (see [A later change to the import](#a-later-change-to-the-import)). The switch is greyed out while **Download updates** is off as well, because nothing is fetched then.

**What switching it off does.** A prerelease that you installed stays installed. Printer Bot goes on running it, and it offers you the next release that is higher than it. It offers no further prerelease. To leave the prerelease at once, press **Go back to the previous version** or **Use the built-in version** (see [Going back](#going-back)).

**Going back to the release.** Delete the Printer Bot action in Streamer.bot, import [import.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/master/import.txt) and reload the dock. Your settings stay. The release does not know the prerelease, so it skips what the prerelease stored for itself (see [Going back](#going-back)).

**How prereleases are kept apart.** The author signs prereleases with the same keys as releases, and Printer Bot checks them in the same way: the signature, the size, the SHA-256 and the version floor. Prereleases sit in their own folder on the dock's host, `core/api1/prerelease/`, which Printer Bot does not read while the switch is off. A prerelease that turns up in the folder of the releases is no update for anyone who has not switched the option on.

## Going back

Under **More** in the Updates card:

- **Go back to the previous version** switches to the version that ran before your last update. With no earlier downloaded version it uses the built-in one and keeps it until you press Update.
- **Use the built-in version** switches to the program that came with your import. It stays on it, also after Streamer.bot restarts, until you press Update. Automatic installs wait meanwhile.

Both buttons work while a downloaded version runs. The card says "Switching versions…" while one of them works. Automatic installs skip a version you went back from, and **Update** installs it if you want it. Going back waits at most 15 seconds for a receipt that is printing, so a receipt that is still printing then may be lost. A press within 30 seconds of the last go-back, or while an update installs, is turned away. The card then says "Printer Bot is busy with a receipt. Try again in a moment."

## Settings in the Updates card

| Setting | What it does |
|---|---|
| **Install updates automatically** | Off by default. On lets Printer Bot install a release automatically when it is idle (see [Install updates automatically](#install-updates-automatically)). A prerelease is never installed this way. The switch is greyed out while **Download updates** is off. |
| **Try prerelease versions** | Off by default. On lets Printer Bot also offer the prereleases the author publishes (see [Prerelease versions](#prerelease-versions)). The switch is greyed out while **Download updates** is off and while the updater is older than revision 3. |
| **Renderer updates** | Where Printer Bot looks for layout updates, normally this dock. Program updates look in the same place. Its **Check layouts** button looks for a new layout at once. The **Check now** next to *Last checked*, higher in the Updates card, looks for a new program. **Use this dock** switches to this dock's address. |
| **Download updates (layouts and program updates)** | On by default, so Printer Bot fetches newer receipt layouts and program updates from the update source and uses them only if the author signed them. Off downloads nothing and uses the built-in layout, and the Updates card says "Updates are switched off. Turn on "Download updates" below." A program update you installed earlier keeps running until you press **Use the built-in version**. Until a dock has connected once, no update source is stored and nothing is downloaded. |
| **Renderer** | Shows the layout version. **Reset to built-in renderer** drops a downloaded layout. |

## A later change to the import

Most updates arrive through the dock. Some versions change something that only an import carries, and the Update button cannot bring that: the events Printer Bot listens to (its triggers), the action itself, the keys that protect updates, or the oldest loader that the new program works with (the loader is the small part of the import that checks and installs updates). Printer Bot needs one new import for such a version.

**How to import.** The steps are the same for every such version.

1. Open the import code of the current version, press Ctrl+A, then Ctrl+C. For a release it is [import.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/master/import.txt). For a prerelease it is [import.prerelease.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/master/import.prerelease.txt).
2. In Streamer.bot, delete the old **Printer Bot** action.
3. Click **Import**, paste and click **Import**. An import creates the triggers again, so switch **Channel Reward** on again if you use it.
4. Reload the dock.

Your settings stay in their own folder. If you host your own dock, upload its files again too (see [Dock Selection](DOCK_SELECTION.md)).

**The bar in the dock.** The dock tells you when a version needs a new import. It shows a bar above the page: "Printer Bot 3.2.1 needs a new import in Streamer.bot. The Update button in the dock cannot replace what an import carries (the triggers, the action and the updater), so import once. Your settings stay. Your Printer Bot is 2.4.5." The first version in it is the newest one that is out, and the last is your own. The bar appears when your Printer Bot is older than the newest version that changed the import. A prerelease shows the same bar, with "(prerelease)" after the version, only when you switched on **Try prerelease versions**. The link **How to import** in the bar opens this section in a new tab, and **Hide** puts the bar away for that version. A later version brings it back. If OBS does not keep the dock's browser data, the bar comes back the next time the dock loads. The bar needs Streamer.bot to be running, because the dock reads your Printer Bot version from it.

The Update button does not replace the import. An import carries three things that the button cannot change: the triggers, the action and the updater. A program update brings new code and nothing else. When the updater inside your Printer Bot is too old for the new program, the Updates card says that a re-import is needed (see below). Otherwise the button installs the new program, and the bar goes away, because the dock reads the version of the program that runs. A feature that needs new triggers works after you import and stays off until then.

**The Updates card.** A loader that is too old for the new program also shows in the Updates card. It says "This Printer Bot needs a one-time re-import to update." or, when your updates still work, "A newer updater needs a one-time re-import. Your settings stay."

**Versions that needed an import.** The last one was 2.5.0, which added the Hype Train triggers. 3.0.0 to 3.2.1 need no new import from an import of 2.5.0 or newer. The switch **Try prerelease versions** needs the updater of an import from 3.0.0 on (revision 3).

## The dock follows your version

The dock matches your Printer Bot version. The page you open in OBS first asks Streamer.bot which version of the action you run, then shows the dock made for that version. A new dock reaches only actions that can use it, and an older action keeps the dock it came with until it is updated. A Printer Bot older than 3.0.0 gets the page of 3.0.0. After importing a new action, reload the dock. If Streamer.bot is off when the dock opens, the launcher uses the version it saw last for up to 7 days, then shows the newest dock and lets that dock read the real version.

## When an update does not work

### "The Printer Bot action in Streamer.bot is older than this dock, so some settings below are switched off."

If the note says "Open Updates below and install the new version.", press **Update** in the Updates card. If it says "Import it again", your Printer Bot is older than 2.4.0 and cannot update itself: import the current code as in [From a version older than 3.0.0](#from-a-version-older-than-300) (or use **Copy import code** and read [Trust](DOCK_SELECTION.md#trust)), switch Channel Reward on again if you use it, and reload the dock.

### The dock looks out of date after an update

Press **Reload dock** in the Updates card, reload the dock, or restart OBS. The dock asks Streamer.bot which Printer Bot version you run and opens the matching page, so after you import a new action the next reload shows the new dock. If OBS still shows an old page, add `?1` to the dock's address once (**Docks → Custom Browser Docks**), which forces a fresh copy.

### "Updates come from: another address: ..."

The action remembers the first dock it met, so this appears after a dock moves to another host name or port. **Renderer updates** in the Updates card shows the old address. To use this dock, press **Use this dock**, then press it again within 5 seconds when it asks "Are you sure? Click again".

### The Renderer row says "refused: ..." or "update check failed"

This happens on a dock you host yourself. Printer Bot keeps its current layout. Upload `renderer.html`, `renderer.html.sig` and `version.json` again from the same ZIP, unchanged, and check that no web server or CDN alters them (see [Dock Selection](DOCK_SELECTION.md#host-it-yourself)). If you moved your dock to another folder on the same host, see [How updates find your dock](DOCK_SELECTION.md#how-updates-find-your-dock).

### The bar "Printer Bot <version> needs a new import in Streamer.bot" shows above the dock

Your Printer Bot is older than the newest version that changed the import, and a program update cannot bring what that version needs. Follow the steps in [A later change to the import](#a-later-change-to-the-import), which the link **How to import** in the bar opens: delete the old Printer Bot action in Streamer.bot, import the current code, switch Channel Reward on again if you use it and reload the dock. Your settings stay. **Hide** keeps the bar away for that version, and your current version keeps working either way.

### The switch "Try prerelease versions" is greyed out

Hover over it. The reason is in its tooltip and in the line under it. Three reasons exist. The updater inside your Printer Bot is older than revision 3, so import Printer Bot once more (every import from 3.0.0 on has the newer updater). **Download updates** is off, so switch it on. Or the Printer Bot action is older than the dock, so update it.

### The Updates card says "Updates are switched off. Turn on "Download updates" below."

Switch on **Download updates (layouts and program updates)** at the bottom of the Updates card. A program update that you installed earlier keeps running while it is off. Press **Use the built-in version** to leave it.

### The Updates card says "Checking soon."

Printer Bot has not asked for updates since its code started, or you switched **Download updates** on again a moment ago. The dock asks for a check automatically within a moment. If the card stays like that, press **Check now** next to *Last checked*.

### The Updates card says "Updates are not available."

The sentence under it names the reason:

- "Printer Bot does not know where to get updates yet. Open the dock from its web address and connect once." Open the dock from a web address (a file on your PC does not work), let it connect and press **Check now** next to *Last checked*.
- "The update host did not answer. Check your internet connection." or "The update host answered with error 503." (the number can differ). The dock's host is down or cannot be reached. Try again later. Printer Bot keeps working.
- "This dock host does not offer program updates." The host has no `core/` folder. On a dock you host yourself, upload it (see [Dock Selection](DOCK_SELECTION.md#host-it-yourself)).
- "The update was not signed by the author, so it was refused." or "The downloaded update was damaged, so it was refused." On a dock you host yourself, upload `core/` again from the same ZIP, unchanged. Check that no web server or CDN changes the files. On the author's dock, try again later. If it stays, report it as described in [SECURITY.md](SECURITY.md).
- "The update came in a format this Printer Bot cannot read." Try again later. If it stays, import the newest code (see [Install](README.md#install)).

### "The update did not work."

The old version keeps running, as the card says, and the sentence under it names the reason. When the download itself fails, a reason from the list above can show here too, such as "The update host did not answer. ..." or "The downloaded update was damaged, so it was refused." Two reasons show only here:

- "Windows or a security program would not let Printer Bot load the update." Printer Bot keeps working with the version that runs. If you want updates, look in your security program's history for a blocked item and allow it.
- "Printer Bot could not write the update to disk." Free some disk space and check that Windows lets Streamer.bot write in its own folder.

Press **Check now**, wait a minute and press **Update** again. After a failure Printer Bot waits a minute before the next try, and it allows three tries an hour. A press sooner than that shows the note "Printer Bot tried this a moment ago. Wait a minute, then try again." under the button, and the red box keeps the real reason of the failure. The sentence "Printer Bot is busy with a receipt. Try again in a moment." shows when the update gave up after waiting several minutes for a receipt that kept printing, or when a **Go back** button was pressed too soon after another switch (see [Going back](#going-back)). Try again when nothing is printing. If the card says "The new version did not start, so the old one is running again.", it offers that version again, and a click tries it again.

### "Printer Bot went back to the built-in version."

A downloaded version kept failing, so Printer Bot dropped it and paused it (see **If a downloaded version stops working** under [Update from the dock](#update-from-the-dock)). It prints with the built-in version meanwhile. The card offers the version again with a **Try 3.2.1 again** button, and a newer version when the author publishes one.

### "The author has paused updates."

The author stopped the roll-out of an update, usually to fix a problem. Your Printer Bot keeps working. Check back later. A version you already installed stays as it is.

### "This Printer Bot needs a one-time re-import to update." or "This update needs a newer updater. Import Printer Bot once. Your settings stay."

The update needs a newer loader than your import has. Follow the steps on the card, which are the ones in [A later change to the import](#a-later-change-to-the-import).

### Something is wrong after an update

Under **More** in the Updates card, press **Go back to the previous version** or **Use the built-in version**. **Reinstall** in **More** downloads the running version again and replaces the stored copy. Use it when the stored files may be damaged. If the dock cannot help, close Streamer.bot, delete the `core` folder inside the data folder (see [Where Printer Bot keeps its files](PRINTER_OPERATION.md#where-printer-bot-keeps-its-files)) and start Streamer.bot again. Printer Bot then runs the built-in version and forgets every downloaded update. Your settings stay.

### Which lines in the Streamer.bot log are about updates?

- `[Printer Bot] Program update 3.2.1 is available. Open the dock to install it.`
- `[Printer Bot] Program update 3.2.1 installed.` (with "automatically" at the end after an automatic install)
- `[Printer Bot] Program update 3.2.1 was not installed (...). The running program is unchanged.` The `...` holds the reason.
- `[Printer Bot] A program update request was refused for now (too many tries). Try again in a while.` This is the log line for a click that was turned away.
- After a crash or a failed start, the log has `[Printer Bot] Program 3.2.1 was running when Streamer.bot ended before it had proven itself. It is tried again now.`, `[Printer Bot] Program 3.2.1 was running when Streamer.bot ended before it had proven itself, twice in a row. The built-in program starts. Open the dock and try it again.` or `[Printer Bot] Program 3.2.1 would not start here. The earlier program keeps running. Open the dock and try it again.`
- When a click downloads a version again over its stored copy, the log has `[Printer Bot] Reinstalled program 3.2.1 (the stored copy was replaced by a fresh download).`
- Other lines start with `[Printer Bot] Program 3.2.1 ...` and say what happened to a version, for example that it would not start here.

Include these lines in a report.
