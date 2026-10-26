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

The prerelease has its own pair of files, [import.prerelease.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/master/import.prerelease.txt) and [import.prerelease.sha256.txt](https://raw.githubusercontent.com/SassyTP/printer-bot/master/import.prerelease.sha256.txt). The dock page of a prerelease copies `import.prerelease.txt` and names `import.prerelease.sha256.txt` in the line under the fingerprint. Compare in the same two ways.

If the values differ, do not import. Get the file again and, if it still differs, report it as described in [SECURITY.md](SECURITY.md). The fingerprint covers the import only. A program update that the dock installs later has its own check, the author's signature (see [How it is protected](PRIVACY.md#how-it-is-protected)).

## Common problems

### My printers and rules are gone

Printer Bot reads them from `settings.json` in its data folder. If Streamer.bot lost that folder, or you imported Printer Bot on a new PC, the settings would start from the defaults. Since 3.0, Printer Bot keeps a copy of its settings outside the Streamer.bot folder (in the data of your Windows account on this PC) and puts it back by itself when `settings.json` is missing or damaged. A new PC has no copy yet. Look for the log line `Restored your settings from the backup copy` and for the note in the dock (see the next entry). If the copy is old or missing, open the **Backup** card of the dock and press **Restore settings**, then choose the file that **Save settings** made earlier. If you never saved one, the setup has to be made again. See [Backing up your settings](PRINTER_OPERATION.md#backing-up-your-settings).

### Save settings does nothing in an OBS dock

Up to 3.0.2 **Save settings** made a download of the browser, and the browser of an OBS dock drops a download without a word, wherever OBS is installed. From 3.0.3 Printer Bot writes the file itself, into `SassyTP\printer-bot\backups` in your Streamer.bot folder, and the dock shows the name of the file. If the dock still says that the file went to the downloads of your browser, your Printer Bot is older than 3.0.3: update it, or use **Settings as text** in the Backup card. If the dock says that the backups folder already holds 200 settings files, delete some of the old ones there and save again. If it says that Printer Bot did not confirm the save, check that Streamer.bot is running and connected, and look in the Streamer.bot log for a line that starts with `[Printer Bot] Save settings`.

### The dock says Printer Bot restored your settings from a backup copy

The note reads "Printer Bot restored your settings from a backup copy outside the Streamer.bot folder." Streamer.bot lost the settings file, or the file was empty or damaged, and Printer Bot took your settings back from its second copy. The settings are those of the last save (the copy is written about two seconds after a save). Nothing needs doing. Press **Dismiss** to hide the note (the dock remembers it), and use **Save settings** in the Backup card to keep a file of your own as well.

The log line `Restored your settings from the backup copy` names the Streamer.bot folder that wrote the copy (`written for the folder ...`). If you run two Streamer.bot folders on one PC, check that name, because the copy belongs to the one that saved last. To begin again from the defaults on purpose, close Streamer.bot, delete `settings.json` in `<Streamer.bot>\SassyTP\printer-bot\` and delete the folder `%LOCALAPPDATA%\SassyTP\printer-bot\mirror`. With only `settings.json` deleted, the copy is put back.

### The dock says the settings are too large to save

Printer Bot does not let `settings.json` grow beyond 60,000 bytes (the part that reads your update switches reads 65,536 bytes at most). The dock shows the sentence "The settings are too large to save: they would take 71,340 bytes and the limit is 60,000, so remove some rules or printers, or shorten their names, and save again." in a warning line above the printers, and the log has a line with the same numbers. Your earlier settings are still in force. Remove some rules or printers, or shorten their names, and the next save goes through. A setup of 100 printers with ordinary names and 300 rules of one test each takes about 47,000 bytes. With two tests in every rule it takes about 60,000 bytes or more, so it may not fit. Very long printer names (up to 256 characters each) and rules with four long tests are what fill the file. The warning stays until a save goes through whole.

### A line in Settings says "Settings use 45,000 of 60,000 bytes."

Printer Bot keeps its settings in one file with a limit of 60,000 bytes. The line shows when the file is above 70 percent of that. Remove printers or rules you do not need before the limit is reached. A change that would make the file too large is refused (see the previous entry).

### The dock says "Not saved yet. Waiting for Streamer.bot."

A change you made has not reached Printer Bot yet. The dock lost its connection to Streamer.bot after you changed a setting (Streamer.bot was restarting or closed), or Streamer.bot did not take the change. The dock keeps the change and sends it when the connection is back, or again after 1, 2, 4, 8 and 16 seconds when Streamer.bot does not take it. The line goes away when the change has been sent. If the line stays, check that Streamer.bot runs, that its WebSocket server is on and that the Printer Bot action is enabled, then reload the dock. A reload drops a change that was not saved yet.

### The dock says "The change could not be saved. The settings show what Printer Bot has."

The dock tried six times (once, then again after 1, 2, 4, 8 and 16 seconds) and Streamer.bot did not take the change. The fields show what Printer Bot has. Check that the Printer Bot action is enabled and read the Streamer.bot log, then change the setting again.

### The dock says "The printers or the rules were changed somewhere else, for example in another dock."

From 3.2.0 a change of the printers or the rules starts from the settings as Printer Bot has them. When printers or rules were added, removed or moved meanwhile, for example in a second dock that is open at the same time (an OBS dock and a browser tab), the dock does not make your change, because it might land on another printer or rule than the one you saw. It shows the printers and rules as they are now: make the change again. Before 3.2.0 a dock that still showed older settings could put them back with its next change, so a switch such as **Allow YouTube High Roller prints** of a printer could be off again after a reload.

### The dock showed "The Printer Bot action is not in Streamer.bot yet" for a moment after Streamer.bot restarted

Up to 3.0.5 this could happen when the connection to Streamer.bot dropped just as the dock connected, for example during a restart of Streamer.bot. The dock showed that card behind the connect dialog, or up to 10 seconds later over a dock that had already connected again, although the action was there all along. Press **Reload dock**, or wait for the next connection. The dock page of 3.0.6, which the host hands out to every Printer Bot from 3.0.0 on, waits for the next connection and shows the right card. If the card stays after the dock has connected, the action is really missing: import it as the card says.

### Nothing prints

Check in this order:

- **Output** is set to *Preview only*.
- The action is disabled. The dock then says "Streamer.bot did not answer. Is the Printer Bot action enabled?".
- **Ignore test triggers** is on and the event is a Test or Simulate.
- **Free receipts per minute** was reached ("Skipped by that limit").
- The Channel Reward trigger is still off (the default) or is set to a different reward.
- The printer is off or disconnected. Stuck jobs show as "3 receipts waiting in the queue, the oldest for 5 min. Is the printer connected and on?".
- From 3.3.0-beta.1, receipts wait in Printer Bot's print queue. The card of the printer says how many and why (see *Receipts wait in the print queue*).

### "No printer found. Install your receipt printer, or pick one below."

The log says "...or choose one in the dock.". Install the printer in Windows, then pick it in the dock's **Printer** list or set `printer` in `settings.json`.

### It prints on the wrong printer, or pages of strange characters come out

Choose the printer yourself. If it does not speak ESC/POS, set **Output** to *Windows printer driver*. From 3.0 the dock helps with this. It warns when a printer on Thermal output looks like an office printer and offers a one-click switch, and **Check this printer** sends one short test line (see [Printers that do not take ESC/POS](PRINTER_OPERATION.md#printers-that-do-not-take-escpos)).

### One of my printers prints nothing, or an event prints on the wrong printer

With more than one printer, check these:

- The card of the printer says **Not set up yet**. Choose a printer for it. A printer that is not set up takes no receipts.
- The status line says the printer is not installed. A printer 2 or higher that was removed from Windows is not replaced by another one. Choose an installed printer.
- In a long list of printers, look for **Needs attention** in the line of the printer, or open the list under **Printers** in the status card (it reads **Show the 3 printers that cannot print**, with the number that fits).
- No rule names the printer and it is not the printer for everything else (its card says so). Then nothing prints there. Add a rule for it under **Rules**, or choose it in the last row of the rules, **Everything else**.
- Everything else prints on printer 1, although you picked another printer for it. The printer you picked is not set up. Its card and the line under **Everything else** say so. Choose a printer for it, or pick another printer.
- **Check where an event prints** (in Settings, under the rules) says where an event goes. Pick the trigger, type the values your rules test and press **Check**. The Streamer.bot log has the same answer for each real event (`TwitchCheer goes to printer 1 (rule 2).`).
- A rule that is not complete keeps its last saved version. The line under the rule says what is missing.
- With **Do not stop at first match** off, an event that passes several rules uses the first of them, from the top: its printer, paper and tray (from 3.2.0). A rule below a wider rule (*Bits is greater than or equal to 2000* under *Bits is greater than or equal to 1000*) is never used for an event that both pass. Drag the narrower rule above the wider one by its handle, or Tab to its handle and press Up. With the switch on, every rule the event passes prints, with its own paper and tray (until then a printer printed it once, by the first of its rules). **Check where an event prints** names every receipt and the rules that add no print.
- A printer prints an event twice (from 3.2.0). With **Do not stop at first match** on, every rule the event passes prints: two rules of one printer that the event passes, on another paper or from another tray, are two receipts. Turn the switch off to print by the first match only, or keep the rules from overlapping (for example *Bits is less than 1000* in the lower one).
- An event prints on one printer although it passes rules of two (from 3.2.0). The first rule it passes decides, and the rules below it are skipped: a new setup reads its rules that way. Turn on **Do not stop at first match** at the top of **Rules** to print such an event on every printer with a rule it passes.
- A rule with a test that needs a value matches nothing until the value is there. A parameter that an event does not carry fails number tests and reads as empty text in text tests.

### The list of printers shows one printer twice

Windows can have two print queues for one printer: one that the maker's driver installed and one that Windows added itself (often on the Microsoft IPP Class Driver). Windows' Settings shows them as one printer, and the dock lists both, as they are two queues. From 3.2.0 the list names the driver of a queue after it when the driver has another name, for example "Brother MFC-L3780CDW series Printer (Microsoft IPP Class Driver)": choose the queue whose driver prints right. `Get-Printer` in PowerShell lists every queue with its driver. A queue you do not use can be removed in Windows (Print Management, or `Remove-Printer -Name ...`); Windows may add it again when the printer is found on the network.

### A test print says "Test print not sent"

A test print that names printers takes only the printers that exist and are set up. "Test print not sent. Left out of the test print: 9 (there are only 3 printers)." means that none of the printers the request named can print, so nothing was printed and nothing counted against the 20 test prints a minute. Name printers by number (`2`), with commas (`2,5`), with ranges (`2,5,10-12`) or as `all`.

### The last line is clipped by the cutter

Raise **Extra feed before cut**.

### Windows locked my account, or a Microsoft sign-in window opened, while Streamer.bot was running

Update to 3.0.5. Before it, every receipt browser that started with a new profile (the first start of Printer Bot, and each extra browser that **Printers per browser** adds) made one failed sign-in to your Windows account: Edge finds out whether the account has an empty password by trying to sign in with an empty password. Windows locks a local account for 10 minutes after 10 failed sign-ins in 10 minutes. Edge also signed these hidden browsers in to the Microsoft account of Windows by itself, and when it later asked Windows for that account, a "Choose a way to sign in" window could open. From 3.0.5 Printer Bot prepares each browser profile before Edge starts (in `Local State` and `Default\Preferences` of the folders `edge-cdp-profile-v5...` below `%LOCALAPPDATA%\SassyTP\printer-bot`) so that Edge does neither. The folders `edge-cdp-profile-v4...` of earlier versions are no longer used; you can delete them while Streamer.bot is closed. A locked account opens again by itself after the lockout time. Close a sign-in window that Edge opened without signing in.

### "Can't start Edge: ..."

Install or repair Microsoft Edge (it comes with Windows 10 and 11), then press **Test print** again.

### The dock says "Enter a whole number from 1 to 100." under Printers per browser

The setting takes a whole number from 1 to 100. A 0, a negative number, a fraction, text or an empty box is refused, and the number that was in use stays. Type a number such as 3 and the message goes.

### The dock says "Enter a whole number of seconds from 90 to 300." under Hype Train end wait

The setting takes a whole number from 90 to 300. A number below 90 or above 300, a negative number, a fraction, text or an empty box is refused, and the number that was in use stays. Type a number such as 120 and the message goes.

### A printer is held back and its receipts wait

From 3.3.0-beta.1 the receipts of a printer that is held back wait in Printer Bot's print queue and print once the hold ends; until then they failed at once. Printer Bot sent a receipt to this printer, and the job did not leave the print queue although the queue reports no problem. The card of the printer says so and offers **Clear stuck jobs**, which takes out of the queue the jobs Printer Bot sent and no other document, and **Try again**, which lets receipts go to the printer again and leaves the stuck job in the queue. The usual cause is a printer that does not understand ESC/POS. Choose *Windows printer driver* for it, clear the stuck job and press **Check this printer** to see a line print. If you cleared the job in Windows yourself, the hold ends by itself within a few seconds. A printer that is off, offline or out of paper is not held back. Its receipts wait in the queue and print when it is ready.

### A sticker printer holds its receipts, or prints nothing

A Brother VC-500W on Wi-Fi (from 3.2.0) keeps its receipts while it cannot print (from 3.3.0-beta.1 in the print queue, with no limit of their own; until then up to ten), and the card of the printer says why: **asleep** (the printer went to sleep after some idle minutes and answers nothing; press its power button once, and the waiting receipts print), **no tape** (put a cassette in, or close the cover), **busy, or its last sticker is still in the slot** (take the sticker out; the printer stops while one is there), or **does not answer** (the printer is off, or not on this network; the address must be a private address or one in the same subnet as this PC, and a name must resolve to one). Printer Bot tries again every few seconds by itself. **Clear stuck jobs** drops the waiting receipts, **Try again** tries at once. Over USB the printer says nothing back: if nothing prints, look at the printer's lights, and at the Windows print queue of the printer, where the job waits as any receipt does. A sticker that comes out blank, or a jam, after the printer printed: tell the author the firmware version of the printer (its web page), as the printers of 2022 and 2026 cut at different moments.

### The dock says a printer looks like an office printer

Printer Bot read the driver and the port of the print queue and found words of an office, home or virtual printer. Thermal output sends ESC/POS commands, which such a printer usually does not understand. Press **Check this printer**. It sends one short line of text. If the line prints correctly, answer **Yes, it printed** and the warning goes. If pages of strange characters come out, or nothing does, answer **No** and press **Use the Windows printer driver on Letter paper**. From 3.0 that sets the paper to Letter as well, because most printers that do not take ESC/POS are office or home printers. A thermal printer that is out of paper prints nothing too, so look at its paper before you answer.

### A Letter receipt comes out on the wrong paper, in the wrong size or in black and white

Printer Bot asks the driver of the printer to print on Letter paper, upright, in color or in monochrome, and the driver has the last word. Open the printer's defaults in Windows (Settings, Printers, your printer, Printing preferences) and check three things. The paper size is Letter and no scaling such as "Fit to page" or "Shrink to fit" is on, because Printer Bot sizes the picture for the sheet itself. The color setting allows color, because a printer set to black and white by default prints a color receipt in gray. The paper tray holds Letter paper. A driver that does not let a program choose the paper (some office printers) prints on the paper its defaults say. If the picture is cut at an edge, the printer cannot print that close to it. Printer Bot keeps half an inch of margin and makes the picture narrower when the printable area is smaller. **Preview only** shows what Printer Bot made, in black and white.

### A page or a card comes from the wrong tray

From 3.2.0 Printer Bot asks the driver for the tray of the printer's row **Tray**, or of the rule that chose the printer for the event (the first of its rules the event passed), and the driver has the last word. The Streamer.bot log line of the receipt names the tray it asked for (`... from MPTray`); a line with no tray means the printer's own tray, the driver's default. If the log says the tray is not a tray of the printer, its driver no longer lists that name: choose a tray again in the dock (the list shows "not a tray of this printer" next to the old one). A name that differs from the driver's only in its spaces or capitals ("Tray 1" and "Tray1", "MPTray" and "MP Tray") is the driver's tray, so a printer that gets the maker's driver keeps its trays. If the log says the driver does not let a program choose the tray, the printer takes its pages from the tray its own settings choose (Settings, Printers, your printer, Printing preferences). Check that the tray holds the paper the rule asks for, and that the printer's own panel names that paper for the tray where it asks. A printer shared from another PC has no trays in the dock.

### A 4 x 6 in card comes out on the wrong paper, shifted or cut at an edge

Printer Bot asks the driver for its own paper of 4 x 6 inches, upright, and turns the picture of the card a quarter turn to fit it, so the card comes out in landscape as you read it. The driver has the last word. Check three things. The tray that the driver takes 4 x 6 paper from (often a photo or manual feed tray) holds 4 x 6 paper, and the printer's own panel says 4 x 6 for that tray where it asks. No scaling such as "Fit to page" or "Shrink to fit" is on in the printer's defaults (Settings, Printers, your printer, Printing preferences), because Printer Bot sizes the card itself. The driver lists a paper of 4 x 6 inches: a driver that has none and cannot make a paper of the user's size prints the card on the paper it is set to, often Letter. Printer Bot still asks such a driver for the tray of the card and puts the card at the top of that paper, in the middle, so a card in that tray comes out right; the log says so once in a while (*has no paper of 4 x 6 in*). Before, the card came from the tray of the printer's own settings, often Letter from Tray 1. A paper size of 4 x 6 in for the printer, in its own app or driver, prints the card on paper of its size. If the card is cut at an edge, the printer cannot print that close to it: Printer Bot keeps 0.2 inch of paper on every side and makes the card smaller when the printable area is smaller. **Preview only** shows what Printer Bot makes of a card, before the driver.

### The log says "This receipt is taller than 10 pages of Letter paper"

A receipt on Letter paper is one page. Only a gifted-subs list with more than 100 names takes more, and then it prints at most 10 pages in black and white and 5 in color. The log says when a list is longer than that, with the number of pages that printed (a theme.css that makes a receipt taller than its pages would say it too). A color page takes 20 MB of memory, which is why color stops sooner. Switch the printer to black and white, or to a roll, if you want a list that long in full.

### A gift list takes two pages, or the names are small

On Letter paper the names of a gifted-subs list are set in columns and in the largest type that fits, down to about 9 points. With **Large message** up to 100 names fit one page. With **Scaled like 80 mm** the big picture and logo leave room for only a few dozen names on the first page, so the rest go on to a second page. Choose **Large message** in the **Letter layout** row of the printer to use the page better. More than 100 names always take more than one page. With **Large message** the first page holds 100 names and every page after it as many as fit, about 130 to 190 (3.0.2), with the logo of the platform at the bottom of every page. With **Scaled like 80 mm** every page holds 100 names at most.

### A picture in a message is cut off, small or stretched in the Large message layout

In the **Large message** layout a picture takes the space that the words leave, as the row **Image fit** says (the row shows only while the layout is Large message). **Fit**, the default since 3.0.1, shows the whole picture, with white margins when its shape is not the shape of the space. Choose **Fill** to cover the whole space (it crops the edges of a picture that has another shape, so a tall photo loses its top and bottom), or **Stretch** to fill the space out of proportion. A printer that was left on Fill under 3.0.0 is on Fit now. A long message leaves little room: the pictures keep at least three quarters of an inch, and words that are still too many are cut at the end of the page (the log says `the end of the page of Letter paper`). A message never prints on a second page of Letter paper.

### Fit, Fill and Stretch look the same on a 4 x 6 in card

On a card, **Image fit** sets only the pictures of a High Roller message: a cheer of at least the **Twitch High Roller threshold (bits)** (or a YouTube High Roller Super Chat) on a printer with **Allow Twitch High Roller prints** (or **Allow YouTube High Roller prints**) and **Allow images** on, with a link to a picture on a site you switched on. Every other receipt (a smaller cheer, a sub, a raid, a High Roller message with no picture) prints as the 80 mm receipt made as large as the card allows, and the three choices print it the same. The words of the row say so.

### The row "Letter layout" is missing, or Large message changes nothing

The row **Letter layout** (from 3.0) shows for a printer whose paper size is **Letter** and whose output is the **Windows printer driver** or **Preview only**. A roll, and **Thermal printer (ESC/POS)**, have no such row, and they print on their roll whatever was chosen. The dock page of an older version has no row: after an update, press **Reload dock**. With **Large message** a short receipt is one whole page: the viewer's small picture in the top left corner with the amount, the name and the time beside it, the message below, and the logo at the bottom. From 3.0.5 only High Roller cheers, High Roller Super Chats and gift subs and gifted memberships (Twitch, YouTube and Kick) print that way. A sub, a raid, a tip or a smaller cheer or Super Chat prints **Scaled like 80 mm** on that printer, on purpose. If two printers on Letter paper print the same layout, check the row under each printer: every printer has its own. A list longer than one page (a gift bomb, an order) goes on to the next page, and the logo ends the list.

### A High Roller cheer on Letter paper is cut short, or its message area looks empty

From 3.0 a High Roller message on Letter paper stays on one page (an early prerelease printed a very large message on several). The viewer's picture, the name and the footer come first, and the message gets what is left of the 10 inch page, about 2 inches on a receipt with a picture. A longer message fades out at the end of the page, and the Streamer.bot log says `the end of the page of Letter paper`. A very large font makes the first line start lower than the message area is tall, so the area shows blank space. Use smaller sizes in the cheer, or print that cheer on a roll, where a message can be much longer. **Maximum length** and **bits per inch** cannot make a Letter message longer than its page.

### A link to a picture prints as text, as [link] or as [image]

Pictures from links print only inside a High Roller message (3.0.1): a cheer of at least the Twitch High Roller threshold, on a printer with **Allow Twitch High Roller prints** on, or (3.0.2) a Super Chat of at least the YouTube High Roller threshold, on a printer with **Allow YouTube High Roller prints** on. A message that is not printed as a High Roller message, a cheer under the number of bits, a cheer on a printer with that switch off, a subscription, a gift or any other message, prints its words, and a link in it stays text, or reads `[link]` with **Hide links in messages** on. In a High Roller message pictures print only from the sites you switched on in the **Advanced** card, under **Images in messages** (3.0), and only a link to a picture: `https://i.imgur.com/<name>.png`, `https://files.catbox.moe/<name>.png` or `https://i.ibb.co/<id>/<name>.png`, ending in `.png`, `.jpg`, `.jpeg`, `.gif` or `.webp`. From 3.0.11 Imgur also takes the page of one picture (`https://imgur.com/<name>`) and an album or post (`https://imgur.com/a/<id>`, `https://imgur.com/gallery/<id>`), which prints its first picture only. From 3.1.0 a Catbox album (`https://catbox.moe/c/<id>`) and an ImgBB album (`https://ibb.co/album/<id>`) print their first picture only, an ImgBB viewer link (`https://ibb.co/<id>`) prints its picture, and a Catbox thumbnail prints the file itself. On ImgBB the first picture of an album is the one the album shows first, the newest, unless the link has a `?sort=`. An album or ImgBB page prints `[image]` when the site did not say within 3 seconds which picture it is (the Streamer.bot log says why), and an album stays text when its first item is a video or another file that is no picture. A link to a video (`.gifv`, `.mp4`) or an SVG, a link without `https`, a link to a site that is off and, on a printer whose **Allow images** switch is off, every picture link stay text. A message prints at most three pictures, and a fourth link stays text. `[image]` means that a picture was meant to print and did not: it did not come within about 2.5 seconds, the site no longer has it, it is not a picture, or it has more than 33 million pixels. The same address is not tried again for ten minutes, so a picture that was only slow comes back on a later message. The answer for an album or an ImgBB page is kept for ten minutes as well. After the update to 3.0.0 the hidden receipt browser is started again once, and the log says so. If every picture is `[image]` after that, close Streamer.bot, end the `msedge.exe` processes that were started by it (Task Manager, Details, the ones whose command line holds `edge-cdp-profile`), start Streamer.bot again and try a preview-only receipt.

### Receipts wait in the print queue

From 3.3.0-beta.1 (a prerelease) a receipt that its printer cannot take waits in Printer Bot's print queue and prints when the printer is back. The card of the printer says how many wait and why, and the reason is the thing to fix: "No printer found" (install the printer, or choose it in the card), "is not installed" (the queue was removed or renamed in Windows), "is held back" (see *A printer is held back and its receipts wait*), "The printer is offline" or "out of paper" (the printer itself), "could not send a receipt" (the driver refused the job; Printer Bot tries again every few seconds), or a sticker printer that is asleep or out of tape. **Try again** tries at once. **Show the receipts** lists them, **Discard** drops one for good, **Discard all** drops them all after a second click, and **Move them to** sends them to another printer. See [The print queue](PRINTER_OPERATION.md#the-print-queue).

### A receipt waits for me after it left the Windows queue twice

Printer Bot counts a receipt as printed only when Windows says the job printed. A job that leaves the Windows print queue without that prints again. After the second time the receipt waits for you, and the card says "Windows did not report a receipt for printer N as printed, twice". Either the job was cancelled in Windows twice (use **Discard** in the dock for a receipt that should not print), or the printer's driver does not report printed jobs. Press **Try again** to print it once more, or **Discard**. If it happens with every receipt of a printer, tell the author which printer and driver it is.

### A receipt printed twice

Rarely, a receipt prints twice: when Streamer.bot or the PC stopped right after the printer printed and before Windows said so, or when Windows dropped a job that had printed. Printer Bot prints a receipt again when it cannot tell that it printed, because a second copy is better than none.

### The dock says the print queue is nearly full

The files of the receipts that wait may take up to the print queue's size (1 GB unless you changed it; from 3.3.0-beta.4 **Advanced**, **All platforms**, **Print queue size (MB)**), and the dock warns at 80 percent. A printer has been unable to print for a long time: the status line and the cards say which. Fix that printer, or discard or move its receipts, or give the queue more room. Above the limit Printer Bot keeps only the event of a new receipt, and draws its picture when there is room.

### The dock says the print queue cannot be used

Printer Bot could not read or write its folder `outbox` (in the data folder; see [Where Printer Bot keeps its files](PRINTER_OPERATION.md#where-printer-bot-keeps-its-files)). Until Streamer.bot starts the action again, receipts go straight to the printers as before 3.3.0, and one that cannot print is lost. Check that the disk is not full and that the folder can be written, then restart Streamer.bot. The receipts that waited are still there and print then.

### The print queue of a printer is full of old jobs

From 3.0 every printer with a print queue on this PC has the button **Clear print queue** in its card. Press it and press it again when it asks. It takes every job out of the Windows print queue of that printer, the documents of other programs as well, and the sentence under the button says how many jobs went. A queue on a network share has no button, so clear it in Windows (Settings, Printers, the printer, Open print queue).

### The dock says every printer has Allow Twitch High Roller prints turned off

**Twitch High Roller threshold (bits)** is above 0, which makes cheers of that many bits print their message styled, and the switch **Allow Twitch High Roller prints** (named *Allow High Roller prints* before 3.0.2) is off under every printer. Those cheers print as ordinary cheers on all printers. Turn the switch on under a printer, or set **Twitch High Roller threshold (bits)** to 0 if you meant to switch High Roller off. The switch shows only while **Twitch High Roller threshold (bits)** is above 0, and the dock remembers its setting while it is hidden. From 3.0.3 the warning is under that setting, in the Twitch group of **Advanced**, and while **Advanced** is closed its summary says *Twitch High Roller off on every printer*.

### A Super Chat did not print as a YouTube High Roller message

From 3.0.2 a Super Chat prints its message styled only when all of this is true: the printer has **Allow YouTube High Roller prints** on (it is off until you switch it on), **YouTube High Roller threshold (amount)** is above 0, the Super Chat has a message, and its amount, in your currency (**YouTube currency** in the **Advanced** card), is at least that amount. A Super Chat in another currency is converted with the exchange rates of the U.S. Treasury. When the dock says that currency exchange is offline, only Super Chats in your currency can be High Roller ones; the others print as ordinary Super Chats, and the Streamer.bot log says `printed as an ordinary Super Chat: there is no exchange rate`. The Treasury does not list every currency of the world: a Super Chat in a currency that the dock does not offer in **YouTube currency** is never converted. A Super Sticker has no message and never prints as one.

### The dock says currency exchange is offline

Printer Bot asks the U.S. Treasury for its exchange rates while a printer has **Allow YouTube High Roller prints** on or (from 3.0.5) prints on Letter paper with **Large message**, at most every 12 hours, and keeps the last good answer in `exchange-rates.json` in its data folder, so a restart without the internet still has them. The dock says offline when there are none to use: the Treasury did not answer (the Streamer.bot log says why, in a line that starts with `Could not load exchange rates`), and there are no rates from the last six months. Printer Bot tries again by itself every 15 minutes. Until then, Super Chats in your own currency still print as YouTube High Roller messages, and the others as ordinary Super Chats. A firewall or a proxy that blocks `api.fiscaldata.treasury.gov` keeps it offline.

### A printer does not cut after a Hype Train

A printer that has **Do not cut Hype Trains** leaves its receipts uncut from the first Hype Train receipt to the End. The dock says "A Hype Train is running" under the box while it does. When the train is over and the dock still says so, press **Reset Hype Train** under the box. Printer Bot cuts the paper, brings the cuts back and tells you what it did. Printer Bot ends a train by itself when the End event comes, when its own end receipt is printed (see the next entry), and when no Hype Train event has come for 4 hours. If the box is on and a Hype Train never begins, check that **Print Hype Trains** is on and that the printer is on **Thermal printer (ESC/POS)** output, because the box does nothing on the Windows printer driver, on **Preview only**, or when **Paper cut** is **None**.

### A Hype Train did not print its end receipt

Check in this order:

- **Print Hype Trains** (in the Twitch group of Advanced) is on, and the four Hype Train triggers are in the action. An import since 2.5.0 has them.
- Streamer.bot is 1.0.4 or newer. Twitch stopped sending the old Hype Train events in January 2026, so an older Streamer.bot sends none.
- Printer Bot waits for the End event. When it does not come, Printer Bot prints the end receipt itself 90 seconds after the time the train was due to expire, or after the wait you set under **Advanced → Hype Train end wait (seconds)**. Twitch moves that time on at every level up, so it can be a while after the last level. The Streamer.bot log says "No End event came for Hype Train ..." when it happens.
- Streamer.bot or Printer Bot was restarted during the train. The expiry times are kept in memory, so the clock starts again with the next event of the train. A train that has been silent for 30 minutes stops counting cheers.

### A printer fails with "port 9292 is used by another program"

Each receipt browser after the first needs its own port on this PC (9292 to 9306 on a normal install). When another program already listens on a port, Printer Bot leaves that program alone. The printers of that browser fail, the other printers print, and the Streamer.bot log says `port 9292 is used by another program, so receipt browser 2 cannot start there`. Close the other program, or raise **Printers per browser** until Printer Bot needs fewer browsers.

### Printer Bot uses a lot of memory with many printers

Each receipt browser is a hidden Edge with its own processes and its own memory. Raise **Printers per browser** (100 keeps one browser) to start fewer of them. The line under the setting says how many browsers your printers need, and the status card of the dock shows the printers.

### The WebSocket server did not start after a restart

The Streamer.bot log says `Failed to bind to address http://127.0.0.1:8080: address already in use`. Printer Bot 2.3.0 and older started the hidden Edge in a way that kept Streamer.bot's port busy after Streamer.bot closed, and the hidden Edge of such a version can still run after you import 3.2.0 over it. End the hidden Edge in Task Manager (the Edge process with no window, see [Where Printer Bot keeps its files](PRINTER_OPERATION.md#where-printer-bot-keeps-its-files)), then start the WebSocket server again in Streamer.bot (**Servers/Clients → WebSocket Server**).

Versions 2.3.1 and later start the hidden Edge without holding anything of Streamer.bot's. Until 3.2.0 Printer Bot also closed, once, the hidden Edge that a version older than 2.4.0 left running on port 9225 or 9226. Versions older than 3.0.0 are no longer supported, so 3.2.0 leaves such a browser alone: end it in Task Manager as above, or restart the PC once.

### A receipt is blank or looks wrong after you added theme.css

Move `theme.css` out of the folder and print again.

### Receipts are too long

Check `theme.css` for `vh`, `height: 100%` or `min-height: 100vh`. For a long High Roller message, set **Twitch High Roller: bits per inch** (for a cheer), **YouTube High Roller: amount per inch** (for a Super Chat) or **High Roller: maximum length**. Gift sub lists are long on purpose and have no limit.

### One receipt took longer than the others

The Streamer.bot log line for each receipt lists its time in parts that add up to **TOTAL**. After a quiet spell Streamer.bot unloads the action's code and loads it again for the next event. Printer Bot then warms up first, and that receipt waits for it. The line shows `Wait: ... (warm-up)`, usually under a second.

### Nothing from Kick prints, even a test from Streamer.bot

Streamer.bot has to be logged in to Kick first. Its log (lines that start with `KickService` or `TokenManager`) says "Kick Broadcaster requested an access token, but no credentials exist" when it is not. Log in your Kick broadcaster account in Streamer.bot's Kick settings, then try again.

### A test from Streamer.bot prints a bare receipt

Streamer.bot's own Test button sends sparse events. A gift bomb comes without names and a YouTube member without a level name, and for a YouTube event you cannot change what it sends. Real events carry that data. The dock's **Test print** samples show a full receipt, and from 3.0.4 you can type the values of any event under the list of samples and print them (see *Your own values* in [The dock's settings](PRINTER_OPERATION.md#the-docks-settings)).

### A real cheer printed differently from my test ("Cheer100" on the receipt, the picture below the words)

Twitch puts the cheermotes that pay the bits into the message of a real cheer (`Cheer2000 Look at this`), and a test from Streamer.bot sends the message without them. Up to 3.0.3 Printer Bot printed them as words, and a picture that opened a High Roller message went below them, because a word came first. From 3.0.4 the cheermotes are left out of a cheer's message, so a real cheer prints as its test does. From 3.0.6 the space next to each cheermote goes with it (3.0.4 and 3.0.5 printed a gap after the opening quote when the message started with one, and two spaces where one stood in the middle), and only a real cheer amount counts, 1 to 100,000 bits written without a leading zero: `Cheer0`, `Cheer007` or `Cheer100001` print as typed. Update Printer Bot if you still see them.

### A test print says TEST at its bottom

From 3.0.4 a receipt that the dock's **Test print** made from values you typed has a line TEST at its bottom. That is on purpose: such a receipt can never pass for a real donation or Super Chat, even if someone else sends one. A sample whose values you did not change prints without it, and so does every real event. To print the sample again, press **Reset to the sample** under the list.

### A test print with my own values says "Test print not sent. The dock sent an event that cannot be read."

Printer Bot 3.0.4 to 3.0.6 refused every test print with values you typed: Streamer.bot does not pass the values through in the form the dock sent them, so the action could not read them. Since 3.0.7 the dock sends them as text and the action reads it. Update to 3.0.7 or newer in the Updates card (**Check now**, then **Update to** the version it offers) and press **Reload dock**. Test prints of the samples, with no values typed, worked all along.

### A test print says "Test print not sent" and names a value

Printer Bot refused the values you typed and printed nothing. The last print in the dock and the Streamer.bot log say why, for example `"isTest" cannot be set in a test print.` (a name that steers Printer Bot itself, such as `isTest`, `printers` or `followRules`, or a picture address), `The value of "message" is longer than 4,000 characters.`, or that a value is not text, a number or yes/no. The dock checks the same limits before it sends, so you see this only when something other than this dock page sent the test print (another tool on the Streamer.bot WebSocket, for example). Change or remove that value and press **Test print** again.

### An event did not print

Some events are skipped on purpose with no log line: single gifted subs inside a gift bomb, gifted Kicks that are not of type LEVEL_UP, Fourthwall orders with a total of zero and Twitch raids below the Raid trigger's minimum (5). Free events over the limit log "More than N free receipts ... the extra ones are skipped". "Nothing printed for ..." appears only for an event type Printer Bot has no layout for.
