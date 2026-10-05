# Security policy

## Reporting a vulnerability

Please report security problems **privately** and do not open a public issue. On GitHub, open this repository's **Security** tab and choose **Report a vulnerability** (private vulnerability reporting).

If that option is not offered, open an issue titled "Security contact request" that says nothing about the problem and contains **no personal contact details**. The maintainer will answer there with a way to continue privately.

## What helps in a report

- The Printer Bot version. The import in `import.txt` is Printer Bot 2.3.0 at the time of writing.
- The receipt layout version, shown in the dock's **Renderer** row. It is a "v" followed by 12 digits, such as v202610050006. The digits are the build time as year, month, day, hour and minute in UTC.
- What you did, what you expected and what happened.
- Whether it needs access to the Streamer.bot WebSocket, access to the dock's web host, or only a viewer's chat message.
- Whether you used a hosted dock or one you host yourself.

## Supported versions

The latest version in this repository.

## What is in scope

- The receipt page and its sanitizer: viewer-controlled text turning into markup, script, network requests or something that prints.
- The signed update path: how a downloaded receipt layout is accepted or refused.
- The Printer Bot action's command channel (what the dock, or anything else on Streamer.bot's WebSocket, can ask it to do).
- The dock, as published in this repository: the launcher (`index.html`, which asks the action for its version and opens the matching dock page in a frame) and the dock pages. Servers that host a dock are out of scope. Whoever runs a server is responsible for its security.

## What is deliberately not protected

- **An unprotected Streamer.bot WebSocket.** Anyone who can reach it can send Printer Bot commands. They can waste paper, send receipts to preview only, switch update checks off and change where updates come from. They can also read the status and the last receipt picture (which shows a viewer's name and message). Switch on authentication for the WebSocket server in Streamer.bot, set a password and tick **Enforce**.
- **What a signature means.** It proves who published a receipt layout. It does not prove the layout is safe. It covers the layout download only. The dock page's own code and the import text are not covered.
- **A dock served over plain http from another computer.** Anyone on the network path can change the dock's code and the import text it hands out, and a password-protected Streamer.bot cannot be used from such a page. (A dock served from this PC, `127.0.0.1` or `localhost`, is not affected.) Compare the import's SHA-256 (below).
- **A hosted dock is trusted code.** A dock is a web page whose code runs in your OBS with a connection to your Streamer.bot, and whoever serves it can change that code at any time. A malicious or compromised dock host could serve a changed dock that runs commands against the Streamer.bot of every user who has it open (Streamer.bot's WebSocket offers a connected program much more than Printer Bot's own commands). It could also read the password the dock has saved in the browser's storage for that address. The layout signature does not cover the dock's code, and the SHA-256 check covers the import only. What helps: use a host you trust or host the dock yourself, use https, and keep WebSocket authentication on with a password set and **Enforce** ticked. That keeps other programs and web pages out. It does not keep out the dock itself, which holds the password.
- **High Roller messages.** A cheer at or above the threshold may print ugly or obnoxious formatting within the documented limits. This is intended. Raise the threshold, or set it to 0, if you do not want it.
- **Programs already running on your PC with your rights.** Printer Bot cannot defend against them.

## Verifying what you import

The import code runs inside Streamer.bot with your full rights, so check it. `import.sha256.txt` holds the SHA-256 of `import.txt`. In PowerShell, in the folder that holds `import.txt`:

```
Get-FileHash -Algorithm SHA256 .\import.txt
```

The **Hash** must equal the value in `import.sha256.txt` (upper or lower case does not matter). If you copy the import code from the dock with **Copy import code**, the dock shows the SHA-256 of the text it copied. Compare it with `import.sha256.txt` from this repository. The dock's own code works out that value, so it cannot vouch for a dock you do not trust. If you do not trust the dock's host, import the `import.txt` from your own download. If the values differ, do not import the code, and report it as described above.
