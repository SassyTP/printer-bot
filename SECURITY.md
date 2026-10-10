# Security policy

## Reporting a vulnerability

Please report security problems **privately** and do not open a public issue. On GitHub, open this repository's **Security** tab and choose **Report a vulnerability** (private vulnerability reporting).

If that option is not offered, open an issue titled "Security contact request" that says nothing about the problem and contains **no personal contact details**. The maintainer will answer there with a way to continue privately.

## What helps in a report

- The Printer Bot version. The dock's **Updates** card shows the version that runs, whether it is built in or downloaded, and the updater's number.
- The receipt layout version, shown in the dock's **Renderer** row. It is a "v" followed by 12 digits, such as v202610051510. The digits are the build time as year, month, day, hour and minute in UTC.
- What you did, what you expected and what happened.
- Whether it needs access to the Streamer.bot WebSocket, access to the dock's web host, or only a viewer's chat message.
- Whether you used a hosted dock or one you host yourself.

## Supported versions

The latest version in this repository.

## What is in scope

- The receipt page and its sanitizer: viewer-controlled text turning into markup, script, network requests or something that prints.
- The signed update path: how a downloaded receipt layout or a program update is accepted or refused. For program updates this includes the loader, the part of the import that checks, stores, starts and replaces the program.
- The Printer Bot action's command channel (what the dock, or anything else on Streamer.bot's WebSocket, can ask it to do).
- The dock, as published in this repository: the launcher (`index.html`, which asks the action for its version and opens the matching dock page in a frame) and the dock pages. Servers that host a dock are out of scope. Whoever runs a server is responsible for its security.

## How program updates are protected

- **What is checked.** Printer Bot uses a program update only if all of this holds. The author signed it with a code key built into your import. The downloaded file matches the signed list byte for byte. The update is newer than the running program and at least as new as the newest update you installed before. It starts. Printer Bot checks a stored update again at every start. Before an install it asks the host for the signed list once more and refuses a key that was revoked in the meantime.
- **Three points hold.** Nothing that reaches Printer Bot through Streamer.bot's WebSocket carries a program or a file. The update commands carry no address. The `configure` command can set the update source, under the rules Printer Bot has always had, and the author's signature decides what runs. Printer Bot runs program code from two places only: the import you pasted, and a program update signed with a code key built into that import. So a WebSocket client, a dock host, a CDN, a connection in between or a hostile dock page cannot make Printer Bot run a program the author did not sign.
- **Where updates come from.** Printer Bot asks the web host that its update source points at, in the folder `core/api1/` at the top of that site. A second folder inside it, `core/api1/prerelease/`, holds prereleases. Printer Bot reads that folder only when you switched **Try prerelease versions** on.
- **Prereleases.** A prerelease is a program update with a number like 3.0.0-beta.1. The same two code keys sign it, and every check above applies to it as to a release. Printer Bot offers a prerelease only to a person who switched the option on, wherever the author put it, and it never installs one automatically. A prerelease is higher than every older release and lower than its own release, so 3.0.0 replaces 3.0.0-beta.2 as an ordinary update.
- **A click, and a way out.** You press **Update** twice. Printer Bot installs a release automatically only if you switch on **Install updates automatically** (off by default), and then only while it is idle. It never installs a prerelease that way. To stop all downloads, switch off **Download updates (layouts and program updates)** in the Updates card. A program you already installed keeps running until you press **Use the built-in version**.
- **The hint about versions that need a new import.** `versions.json`, which the dock's host serves, carries an unsigned hint that names the newest version that needs a new import in Streamer.bot (`core.import`). The launcher page reads it and shows a bar to a Printer Bot that is older than that version. The hint enables nothing and installs nothing. A host that serves a false hint can show a bar that is not needed or keep a needed bar away, and it cannot make Printer Bot run a program.
- **The checksum.** The checksum in `import.sha256.txt` covers the import, which holds the loader and the built-in program. The signature covers a program update.

## How settings are protected

- **The backup copy of the settings.** The copy in `%LOCALAPPDATA%\SassyTP\printer-bot\mirror` is read only when `settings.json` is missing, empty or cannot be read. It is cleaned like any `settings.json` (limits on every value, a rule that cannot be kept whole is removed, an update address must be a plain http or https address). A program update still needs the author's signature, so a changed copy cannot install anything. A program that runs as you can already write `settings.json` in the Streamer.bot folder, so the copy adds no new way in. A readable `settings.json` is never replaced by the copy.
- **The size of `settings.json`.** The part of Printer Bot that reads the update switches ignores a `settings.json` of more than 65,536 bytes, and then uses the defaults (downloads on). Printer Bot refuses every save that would take the file over 60,000 bytes (a save that makes a file that is already too large smaller is accepted, so such a file can be brought down), so a switch you set to off cannot be read as its default because the file grew.

## Known limits

- **An unprotected Streamer.bot WebSocket.** Anyone who can reach it can send Printer Bot commands. They can waste paper, send receipts to preview only, switch update checks off, switch automatic installs on, switch prerelease versions on, start a program update, go back to the previous or built-in version, change where updates come from, make Printer Bot forget the remembered viewer pictures (it looks them up again), switch the Hype Train receipts on or off and change which printers print which events. They can also read the status (which lists your printers and rules) and the last receipt picture (which shows a viewer's name and message). They cannot make Printer Bot run a program the author did not sign. Switch on authentication for the WebSocket server in Streamer.bot, set a password and tick **Enforce**.
- **What a signature means.** A signature proves who published a receipt layout or a program update, and you trust that publisher for what it does. Layouts and program updates use different keys. The key for program updates, the code key, is built into your import. Neither signature covers the dock page's own code or the import text.
- **The author's code key.** Whoever holds it can publish a program update that runs with your rights on every PC that installs it. Protect it like a password to every user's PC. Installing an update means trusting the author with that. Printer Bot has two code keys built in. The active key signs releases. The standby key is kept away from the computer that builds releases and can sign a notice that revokes the active key. Every Printer Bot that sees the notice then refuses the revoked key. Until the notice is published and seen, an update signed with a stolen key would be accepted. The notice takes effect for new checks and when Streamer.bot next starts. A program that already runs keeps running. The standby key itself cannot be revoked. If it is stolen, or if both keys are lost, the fix is a new import for everyone.
- **A host that holds updates back.** A dock host can stop updates. It can also keep serving an older update that the author signed and that is newer than the version you run. It cannot make Printer Bot run anything unsigned.
- **A prerelease raises the version floor.** Like any update, a prerelease that you ran sets the lowest version Printer Bot offers you afterwards. After 3.0.0-beta.2 it offers versions above that number only, so a release 2.5.5 would not be offered. To go back to the release line, import the code of the release (see [Prerelease versions](UPDATING.md#prerelease-versions)).
- **A mistaken version number.** If the author ever publishes a program update with a far too high version number, every PC that installed it refuses all lower versions afterwards, and the Updates card says "Up to date." for them. To reset one PC, close Streamer.bot and delete the `core` folder inside Printer Bot's data folder. Printer Bot then runs the built-in version again.
- **A dock served over plain http from another computer.** Anyone on the network path can change the dock's code and the import text it hands out, and a password-protected Streamer.bot cannot be used from such a page. A dock served from this PC (`127.0.0.1` or `localhost`) is unaffected. Compare the import's SHA-256 (below).
- **A hosted dock is trusted code.** A dock is a web page whose code runs in your OBS with a connection to your Streamer.bot, and whoever serves it can change that code at any time. A malicious or compromised dock host could serve a changed dock that runs commands against the Streamer.bot of every user who has it open (Streamer.bot's WebSocket offers a connected program much more than Printer Bot's own commands). It could also read the password the dock has saved in the browser's storage for that address. Neither the layout signature nor the program signature covers the dock's code, and the SHA-256 check covers the import only. What helps: use a host you trust or host the dock yourself, use https, and keep WebSocket authentication on with a password set and **Enforce** ticked. That keeps other programs and web pages out. The dock itself holds the password, so authentication cannot protect you from a hostile dock.
- **High Roller messages.** A cheer at or above the threshold may print ugly or obnoxious formatting within the documented limits. This is intended. Raise the threshold, or set it to 0, if you do not want it.
- **Programs already running on your PC with your rights.** Printer Bot cannot defend against them.

## Verifying what you import

The import code runs inside Streamer.bot with your full rights, so check it. `import.sha256.txt` holds the SHA-256 of `import.txt`. [Troubleshooting](TROUBLESHOOTING.md#check-your-import-optional) describes both ways to compare: from a saved file with PowerShell, or from the value the dock shows after **Copy import code**. In PowerShell, in the folder that holds the saved `import.txt`:

```
Get-FileHash -Algorithm SHA256 .\import.txt
```

The **Hash** must equal the value in `import.sha256.txt` (upper or lower case does not matter). The dock's own code works out the value it shows, so that comparison can vouch only for a dock you trust. If you do not trust the dock's host, import the code from this repository. If the values differ, do not import the code, and report it as described above.

The fingerprint covers the import only, which holds the loader and the built-in program. The author's signature checks a program update that the dock installs later.
