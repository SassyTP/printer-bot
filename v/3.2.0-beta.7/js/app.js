// ============================================================================
// Printer Bot dock: the control panel
//
// Streamer.bot builds and prints the receipts. This page:
//   - connects to Streamer.bot's WebSocket server,
//   - checks that the "Printer Bot" action is imported (and helps import it),
//   - shows status, edits settings, runs a test print and previews the last receipt.
//
// It talks to the action with   doAction(action, { pbCommand: 'status' | 'saveSettings' | 'updateCore' | ... })
// and the action answers with a broadcast   { pb: 'status' | 'preview' | 'updater', ... }
//
// Since 2.4.0 the action can update itself. Its updater sends   { pb: 'updater', ... }   (the Updates card shows it) and takes the commands
// checkCore, updateCore, rollbackCore and updaterStatus. An action older than 2.4.0 has no updater, and the card then explains the one-time import.
//
// More than one printer, and the rules that choose the printers of an event, are in js/printers.js (loaded before this file) with the list of triggers
// and parameters in js/catalog.js. This file calls PrintersRender after every status and PrintersOnRoute for the answer of a route check.
//
// Rules this file follows:
//   - Nothing from a status or updater message goes into the page as HTML. Every value is set with textContent
//     (the h() helper below), so a forged message can only show text.
//   - index.html has no inline handlers. Every listener is added here, which lets the page carry a strict CSP.
//   - Browser storage may be blocked (OBS profiles, privacy modes), so every access is in try/catch with an in-memory fallback.
//
// This file belongs to one dock page version. The router (index.html at the top of the web host) picks the dock page that matches the
// version of the Printer Bot action, and this page tells the router which backend version it sees (see ReportBackendVersion).
// ============================================================================

// The version of this dock page. The build tool checks that it and minActionVersion in config.json both equal the name of this folder.
const FRONTEND_VERSION = '3.2.0-beta.7';

// The first Printer Bot version that can update itself. An older action has no updater, whatever it sends.
const LOADER_SINCE = '2.4.0';

// The updater (the loader inside the action) has a revision number, which it sends as loader.rev in every updater message. An import of 2.4.0 or 2.4.1
// carries revision 1, and an import of 2.4.2 carries revision 2. This page works with both and tells them apart by that number. A message without it counts as revision 1.
//   revision 1  a version that failed to start or was running when Streamer.bot ended is set aside for good (the list update.rejected names it)
//   revision 2  such a version is paused and offered again (update.failedBefore) and can be installed again, also over a stored copy (updateCore with force, can.reinstall)
//   revision 3  the updater offers prerelease versions (3.0.0-beta.1) when the setting prereleaseUpdates is on. An updater of revision 2 ignores that setting.
const RETRY_SINCE_REV = 2;        // the first revision that can try a version again
const PRERELEASE_SINCE_REV = 3;   // the first revision that can offer prerelease versions

// Where the import code of this dock page sits on the web host (two folders up from this page). A dock page for a prerelease belongs to the prerelease import.
const IMPORT_FILE = IsPrereleaseVersion(FRONTEND_VERSION) ? 'import.prerelease.txt' : 'import.txt';
const IMPORT_SUM_FILE = IMPORT_FILE === 'import.txt' ? 'import.sha256.txt' : 'import.prerelease.sha256.txt';

// The build stamp this script was loaded with (js/app.js?v=<12 hex digits>). The build tool puts the same stamp on every address in index.html.
// Addresses made in this file get it too (see Stamped), so a browser that caches hard still fetches a changed icon.
// If the stamp cannot be read, nothing is added and the page works as before.
const ASSET_STAMP = (() => {
    try {
        const v = new URL(document.currentScript.src).searchParams.get('v');
        return v && /^[0-9a-f]{12}$/.test(v) ? v : '';
    } catch (e) { return ''; }
})();
const Stamped = (path) => ASSET_STAMP ? `${path}?v=${ASSET_STAMP}` : path;

const urlParams = new URLSearchParams(window.location.search);

const $ = (id) => document.getElementById(id);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// str and num cannot throw. An object that came from JSON can have its own toString or valueOf (a forged message), which makes String() and Number() throw.
const str = (v, max = 1000) => { let s; try { s = v == null ? '' : String(v); } catch (e) { s = ''; } return s.length > max ? s.slice(0, max) : s; };
const num = (v) => { let n; try { n = Number(v); } catch (e) { n = 0; } return Number.isFinite(n) ? n : 0; };

// Builds an element. Strings are added as text nodes, so they are never parsed as HTML.
function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const key of Object.keys(attrs)) el.setAttribute(key, attrs[key]);
    el.append(...kids.filter(k => k !== null && k !== undefined && k !== false));
    return el;
}

let actionId = null;          // the Printer Bot action in Streamer.bot (from config.json)
let minActionVersion = '';    // from config.json: an imported action older than this is out of date
let pbStatus = null;          // last status the action sent
let statusSeen = false;       // has the action answered since the last (re)connect?
let sbConnected = false;
let connectionTurn = 0;       // counts every connect and every disconnect: a check of the action that finds another turn belongs to a connection that is gone (CheckAction)
let legacyActionsFound = false;
let previewOpen = false, lastPreviewAt = '';
let statusTimer = null, saveTimer = null, savedFlagTimer = null;
let pendingSettings = {};     // edits made on screen, waiting for the 400 ms save timer (or held back, because the action could not be reached)
const inFlight = {};          // edits already sent to the action but not confirmed by a status yet: { id: { value, at } }
const IN_FLIGHT_MS = 4000;
// An edit goes through these states: it waits in pendingSettings, it is sent (inFlight protects the field from an older status, awaitingSave holds the Saved flag back),
// and a status that carries its value confirms it. A send that fails puts its edits back into pendingSettings (SaveFailed), and the first status of the next
// connection sends them again (FlushPending). A send that nobody confirms leaves the field when its window ends (WindowEnded): the field shows what the action reported.
const awaitingSave = {};      // setting id -> { value, at }: sent, and the Saved flag waits for a status that carries the value
const lastSendOf = {};        // setting id -> the number of the last send that carried it
const outstandingSends = new Map();     // send number -> { patch, at, handled }: sent, and the action has not answered yet
let sendSeq = 0;
let unsavedWaiting = false;   // edits are held back because the action could not be reached: the line "Not saved yet" shows
let saveRetries = 0, saveRetryTimer = null, windowTimer = null, saveFailedNote = '', saveFailedTimer = null;
const RETRY_WAITS_MS = [1000, 2000, 4000, 8000, 16000];      // waits before the retries of a send that failed while the connection was up. After the last one the dock gives up
const SAVE_FAILED_TEXT = 'The change could not be saved. The settings show what Printer Bot has.';
const MIRROR_KEY = 'pbMirrorNote-' + FRONTEND_VERSION;       // browser storage: the person dismissed the note about settings restored from the backup copy
let sourceConfigureDone = false;   // the one-time "set the update source" check after a (re)connect
let pbUpdater = null;         // the last pb:'updater' message of this connection, reduced by NormalizeUpdater (null until the action sends one)
let updaterAsked = false;     // has this connection asked the action for its updater state yet?
let lastReportedVersion = null;    // the backend version this page last told the router about

const MODE_TEXT = {
    escpos: 'Fastest. For thermal printers that speak ESC/POS (most do).',
    windows: 'Uses the printer\'s normal driver. Slower, but works with any printer.',
    png: 'Saves receipt pictures instead of printing. Good for trying things out.',
    vc500w: 'A Brother VC-500W colour sticker printer, over Wi-Fi or USB. High Roller messages print as stickers of their own layout; everything else as a receipt on the tape.',
};
const MODE_NAME = { escpos: 'Thermal printer (ESC/POS)', windows: 'Windows printer driver', png: 'Preview only (no printer)', vc500w: 'Brother VC-500W sticker printer' };
const modeName = (mode) => hasOwn(MODE_NAME, mode) ? MODE_NAME[mode] : mode;
const modeText = (mode) => hasOwn(MODE_TEXT, mode) ? MODE_TEXT[mode] : '';
const SOURCE_NAME = { embedded: 'built in', hosted: 'downloaded' };

// This dock's folder, where the action may fetch renderer updates from. It is set only for a normal web address.
const FOLDER_URL = (() => {
    try {
        if ((location.protocol === 'http:' || location.protocol === 'https:') && !location.username && !location.password)
            return new URL('./', location.href).href;
    } catch (e) { }
    return '';
})();


/////////////
// STORAGE //
/////////////

// localStorage can be missing or blocked (the accessor itself can throw). Nothing here may ever stop the dock from drawing.
const memoryStore = new Map();
const store = {
    get(key) {
        if (memoryStore.has(key)) return memoryStore.get(key);
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
        value = String(value);
        try { window.localStorage.setItem(key, value); memoryStore.delete(key); } catch (e) { memoryStore.set(key, value); }
    },
    remove(key) {
        memoryStore.delete(key);
        try { window.localStorage.removeItem(key); } catch (e) { }
    },
    keys() {
        const keys = [];
        try { for (let i = 0; i < window.localStorage.length; i++) keys.push(window.localStorage.key(i)); } catch (e) { }
        return keys;
    },
};


/////////////////
// PAGE NOTICES //
/////////////////

// Messages about the page itself, shown even when nothing is connected.
function AddPageNotice(text, level) {
    $('page-notices').append(h('p', { class: 'note' + (level === 'error' ? ' error' : '') }, text));
}


////////////
// CONFIG //
////////////

// ?config=<file> may only name a .json file that sits next to this page. It cannot be a URL or a path.
const CONFIG_NAME = /^[A-Za-z0-9._-]+\.json$/;
let configName = 'config.json';
const askedConfig = urlParams.get('config');
if (askedConfig) {
    if (CONFIG_NAME.test(askedConfig) && askedConfig.length <= 100) configName = askedConfig;
    else AddPageNotice(`The ?config=${str(askedConfig, 60)} part of the address was ignored. It may only name a .json file next to this page. Using config.json.`);
}

// The syntax and the order of a version (3.0.0-beta.1 is a prerelease, and it is above 2.5.4 and below 3.0.0) are in js/version.js.
function IsOlderVersion(a, b) {          // true when version a is older than version b (an unreadable a counts as older)
    const pa = ParseVersion(a), pb = ParseVersion(b);
    if (!pb) return false;
    if (!pa) return true;
    return CompareVersions(pa, pb) < 0;
}

// config.json does not change while the dock is open, so it is fetched once and shared.
// A missing, broken or wrongly shaped file ends in a visible message, so the dock is never blank.
const configPromise = (async () => {
    const res = await fetch(ASSET_STAMP ? `${configName}?b=${ASSET_STAMP}` : configName, { credentials: 'omit', cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let cfg;
    try { cfg = await res.json(); } catch (e) { throw new Error('it is not valid JSON'); }
    const actions = isObj(cfg) && Array.isArray(cfg.requiredSbActions) ? cfg.requiredSbActions : [];
    const id = actions[0] && typeof actions[0].id === 'string' ? actions[0].id.trim() : '';
    if (!/^[0-9A-Za-z-]{8,64}$/.test(id)) throw new Error('it does not name the Printer Bot action (requiredSbActions[0].id)');
    return {
        title: str(cfg.title, 60) || 'Printer Bot',
        actionId: id,
        minActionVersion: ParseVersion(cfg.minActionVersion) ? cfg.minActionVersion : '',
    };
})();

configPromise.then(config => {
    const domain = getComputedStyle(document.documentElement).getPropertyValue('--domain').trim();
    document.title = `${domain} \u2022 ${config.title}`;
    $('title').textContent = config.title;
    minActionVersion = config.minActionVersion;
    if (pbStatus) RenderOutdated(pbStatus);          // a status can arrive before the config has loaded
    if (configName !== 'config.json') AddPageNotice(`Using the config file ${configName} (from the address of this page).`);
}, err => {
    $('title').textContent = 'Printer Bot';
    AddPageNotice(`Could not load ${configName}: ${err.message}. The dock needs it to find the Printer Bot action. Check that the file is next to this page, then reload.`, 'error');
    console.warn('Failed to load config:', err);
});


/////////////////////////
// STREAMER.BOT CLIENT //
/////////////////////////

const LOOPBACK = /^(localhost|127(\.\d+){3}|\[?::1\]?|.*\.localhost)$/i;
// A page served over plain http from anywhere but this computer: what you type here and every command can be read or changed on the way.
const IsRemotePlainHttp = (protocol, hostname) => protocol === 'http:' && !LOOPBACK.test(hostname);
// An https page talking to a plain ws:// Streamer.bot that is not on this computer (browsers may block that)
const NeedsMixedContentNote = (protocol, address) => protocol === 'https:' && !!address && !LOOPBACK.test(address);
// An https page that is not on this computer talking to Streamer.bot on this computer: Chrome and Edge 147 and later ask the user, once, to allow that
// (the browser inside OBS 32 is older and does not ask).
const NeedsLocalAccessNote = (protocol, hostname, address) => protocol === 'https:' && !LOOPBACK.test(hostname) && (!address || LOOPBACK.test(address));
const pageIsPlainHttp = IsRemotePlainHttp(location.protocol, location.hostname);

let sbClientListeners = [];      // a copy of the client's listeners, taken once at load (see below)

const rememberChoice = store.get('sbRemember') !== '0';           // default: remember, so OBS still works after a restart
$('sb-remember').checked = rememberChoice;
$('sb-address').value = store.get('sbServerAddress') || '127.0.0.1';
$('sb-port').value = store.get('sbServerPort') || '8080';
if (rememberChoice) $('sb-password').value = store.get('sbServerPassword') || '';
else store.remove('sbServerPassword');                             // unticked: never keep one

const sbClient = new StreamerbotClient({
    host: $('sb-address').value.trim(),
    port: $('sb-port').value.trim(),
    password: $('sb-password').value,
    immediate: true,

    onConnect: () => {
        SetConnectionState(true);
        // The client empties its listeners whenever a connection closes for good, and that includes a first connection that failed to log in.
        // This runs before the client subscribes, so the copy taken at load goes back in first.
        sbClient.listeners = sbClientListeners.slice();
    },
    onDisconnect: () => SetConnectionState(false),
    onError: (err) => SetErrorMessage(err),
});

sbClient.on('General.Custom', (response) => HandleBroadcast(response.data));
sbClientListeners = sbClient.listeners.slice();       // on() adds the entry at once, so the copy holds it. It is taken only here, never again.

// Address and port are always kept. The password is kept only if "Remember on this computer" is ticked.
// What is stored is what the client connected with, so text typed in the dialog but never used is not saved.
function PersistConnection() {
    const o = sbClient.options;
    store.set('sbServerAddress', String(o.host));
    store.set('sbServerPort', String(o.port));
    if ($('sb-remember').checked && o.password) store.set('sbServerPassword', String(o.password));
    else store.remove('sbServerPassword');
}

function SetConnectionState(isConnected) {
    sbConnected = isConnected;
    connectionTurn++;
    // A save that is still waiting for its answer when the connection changes is put back at once. The client library never ends such a request until its 10 s are up.
    // It may or may not have reached the action, and sending the same values again does no harm.
    for (const [send, record] of outstandingSends) { record.handled = true; SaveFailed(send, record.patch, record.at); }
    outstandingSends.clear();
    for (const id of Object.keys(inFlight)) delete inFlight[id];         // the protection of an edit never outlives the connection it was sent on
    unsavedWaiting = Object.keys(pendingSettings).length > 0;
    RenderUnsaved();
    if (isConnected) {
        PersistConnection();
        statusSeen = false;
        saveRetries = 0;
        sourceConfigureDone = false;
        pbUpdater = null;                 // the updater state belongs to a connection: the next status and updater messages bring a new one
        updaterAsked = false;
        idleVersion = '';
        calmCore = null;
        lastUpdaterState = null;
        droppedFrom = '';
        rollbackAskedAt = 0;
        rollbackWorking = false;
        rollbackFromKey = '';

        $('sb-connect-dialog').style.display = 'none';
        $('blur-layer').style.display = 'none';
        $('sb-error-label').style.display = 'none';
        $('sb-status-icon').src = Stamped('assets/icons/connected.svg');
        $('sb-status-button').title = `Connected to ${str(sbClient.info && sbClient.info.name, 80)} (${str(sbClient.info && sbClient.info.version, 40)})`;

        CheckAction();
    }
    else {
        $('sb-connect-dialog').style.display = 'flex';
        $('blur-layer').style.display = 'block';
        $('sb-status-icon').src = Stamped('assets/icons/disconnected.svg');
        $('main').hidden = true;
        $('setup-card').hidden = true;
        SetErrorMessage('Disconnected from Streamer.bot');
    }
}

function SetErrorMessage(error) {
    $('sb-error-label').textContent = error == null ? '' : String(error);
    $('sb-error-label').style.display = 'block';
}

function Connect() {
    sbClient.options.host = $('sb-address').value.trim();
    sbClient.options.port = $('sb-port').value.trim();
    sbClient.options.password = $('sb-password').value;
    sbClient.connect();
}

function OpenConnectDialog() { $('sb-connect-dialog').style.display = 'flex'; $('blur-layer').style.display = 'block'; }
function CloseConnectDialog() { $('sb-connect-dialog').style.display = 'none'; $('blur-layer').style.display = 'none'; }

// What the dialog warns about, for the page and the address as they are right now
function UpdateConnectNotes() {
    $('sb-http-warning').hidden = !pageIsPlainHttp;
    $('sb-https-note').hidden = !NeedsMixedContentNote(location.protocol, $('sb-address').value.trim());
    $('sb-local-note').hidden = !NeedsLocalAccessNote(location.protocol, location.hostname, $('sb-address').value.trim());
}

$('sb-remember').addEventListener('change', () => {
    store.set('sbRemember', $('sb-remember').checked ? '1' : '0');
    if ($('sb-remember').checked) { if (sbConnected) PersistConnection(); }       // (nothing is saved before a successful connect)
    else store.remove('sbServerPassword');
});
$('sb-address').addEventListener('input', UpdateConnectNotes);
UpdateConnectNotes();


/////////////////////////////
// TALKING TO THE ACTION   //
/////////////////////////////

// Resolves to true when the action took the command and to false when it did not (no connection, no answer, refused). It never rejects.
function Send(command, extra) {
    if (!actionId) return Promise.resolve(false);
    return sbClient.doAction({ id: actionId }, { pbCommand: command, ...(extra || {}) })
        .then(() => true, err => {
            // A command that finds the connection gone is a normal part of a reconnect, so it is a warning. Anything else is an error.
            const quiet = /not connected|aborted|timed out/i.test(String(err && err.message));
            (quiet ? console.warn : console.error)(`Printer Bot command "${command}" failed:`, err);
            return false;
        });
}

// Checks that the action is imported. Shows setup help if it is not, otherwise the control panel.
// A check belongs to the connection that started it. When that connection closes while the check waits (for config.json or for the list of actions), the
// check stops and leaves the page alone: the disconnect has put up the connect dialog, and the next connection runs a check of its own. Before 3.0.6 a
// list that failed this way was logged as an error and showed the setup card ("not in Streamer.bot yet") behind the connect dialog, and a list whose
// connection closed after it was sent could time out 10 seconds later and show that card over the dock of the next connection.
async function CheckAction() {
    const turn = connectionTurn;
    const stillOurs = () => sbConnected && connectionTurn === turn;
    let config;
    try { config = await configPromise; }
    catch (err) { return; }                       // the page already says why (see AddPageNotice above)
    if (!stillOurs()) return;
    actionId = config.actionId;

    let found = false;
    try {
        const response = await sbClient.getActions();
        found = response.actions.some(a => a.id === actionId);
        legacyActionsFound = response.actions.some(a => a.name === 'Printer Bot | Events' || a.name === 'Printer Bot | Print Routine');
    } catch (err) {
        // The client says "not connected" when the socket closed before the request (its close event, and so our disconnect, may come a moment later),
        // and "aborted" when it gave a waiting request up. Both are a normal part of a reconnect, as in Send. Any other failure of a live connection is an error.
        if (!stillOurs() || /not connected|aborted/i.test(String(err && err.message))) {
            console.warn('The list of actions was not read: the connection to Streamer.bot closed.', err);
            return;
        }
        console.error('Could not list actions:', err);
    }

    if (!found) {
        $('main').hidden = true;
        $('setup-card').hidden = false;
        $('legacy-note').hidden = !legacyActionsFound;
        $('setup-text').textContent = 'The Printer Bot action is not in Streamer.bot yet. Importing it takes about 10 seconds.';
        return;
    }

    $('setup-card').hidden = true;
    $('main').hidden = false;

    // One command on connect. The first status tells us whether the action has an update source yet (see FirstStatus).
    RequestStatus();
}

function RequestStatus() {
    Send('status');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
        if (!statusSeen) SetStatusLine('warn', 'Streamer.bot did not answer. Is the Printer Bot action enabled?');
    }, 5000);
}

function HandleBroadcast(data) {
    if (!isObj(data) || typeof data.pb !== 'string') return;      // ignore other custom events
    try {
        if (data.pb === 'status') RenderStatus(data);
        else if (data.pb === 'last') ApplyLastPrint(data);
        else if (data.pb === 'preview') RenderPreview(data);
        else if (data.pb === 'updater') RenderUpdater(data);
        else if (data.pb === 'route') PrintersOnRoute(data);
    } catch (err) { console.error('Could not show a Printer Bot message:', err); }
}

// Sent by the action after every print (or failed print), so the status card stays live without polling.
function ApplyLastPrint(update) {
    if (!pbStatus || !isObj(update.last)) return;           // no full status yet, and it will carry this anyway
    pbStatus.last = NormalizeLast(update.last);
    pbStatus.hasPreview = update.hasPreview === true;
    if (isObj(update.edge)) pbStatus.edge = { state: str(update.edge.state, 40), message: str(update.edge.message) };
    RenderSummary(pbStatus);                                // status line and rows only, the settings form is left alone
    if (previewOpen && pbStatus.hasPreview && pbStatus.last.at !== lastPreviewAt) Send('preview');
}


////////////
// STATUS //
////////////

function SetStatusLine(level, text) {
    $('status-dot').className = 'dot ' + level;
    $('status-text').textContent = text;
}

function NormalizeLast(l) {
    l = isObj(l) ? l : {};
    return {
        ok: !!l.ok, ms: Math.max(0, Math.round(num(l.ms))), at: str(l.at, 60), source: str(l.source, 100), error: str(l.error), mode: str(l.mode, 20),
        to: Array.isArray(l.to) ? l.to.slice(0, RT_MAX_LIMITS.printers).map(n => Math.round(num(n))).filter(n => n >= 1) : [],          // 3.0: the printers the receipt went to
    };
}

// Whatever arrives is reduced to strings, numbers and booleans of the right shape before anything is drawn.
// A message from an older action (missing fields) or a forged one then cannot throw or carry markup.
// 3.2.0-beta.7: a print queue as the lists of printers show it: its name, then its driver when the driver has another name, so two queues of one printer (one of the maker's
// driver and one that Windows added itself) can be told apart; a name that is not a queue of this PC any more is "(not installed)"
function PrinterQueueLabel(name, printer) {
    const installed = printer && Array.isArray(printer.installed) ? printer.installed : [];
    if (!installed.includes(name)) return name + ' (not installed)';
    const drivers = printer && printer.drivers ? printer.drivers : null;
    const driver = drivers && Object.prototype.hasOwnProperty.call(drivers, name) ? drivers[name] : '';
    return driver && driver.toLowerCase() !== name.toLowerCase() ? `${name} (${driver})` : name;
}

function NormalizeStatus(d) {
    const p = isObj(d.printer) ? d.printer : {};
    const q = isObj(p.queue) ? p.queue : null;
    const e = isObj(d.edge) ? d.edge : {};
    const r = isObj(d.renderer) ? d.renderer : {};
    const u = isObj(d.updateSource) ? d.updateSource : null;
    const list = (a) => Array.isArray(a) ? a.slice(0, 200).map(x => str(x, 300)) : [];
    // 3.2.0-beta.7: the driver of each installed queue, by the queue's name, for the lists of printers (an action before 3.2.0-beta.7 sends none)
    const driversOf = (o, names) => {
        const out = Object.create(null);
        if (!isObj(o)) return out;
        for (const n of names) if (Object.prototype.hasOwnProperty.call(o, n) && typeof o[n] === 'string' && o[n]) out[n] = str(o[n], 300);
        return out;
    };
    const queueOf = (x) => isObj(x) ? { state: str(x.state, 20), jobs: Math.max(0, Math.round(num(x.jobs))), oldestSec: Math.round(num(x.oldestSec)), text: str(x.text) } : null;
    // 3.0.0-beta.4: what the action says about ESC/POS for a printer: the kind of its queue (from what Windows says of it), whether it is held back, and the answer to Check this printer.
    // Null from an action that does not say.
    const careOf = (x) => isObj(x) ? {
        kind: ['likely', 'unknown', 'unlikely'].includes(x.kind) ? x.kind : 'unknown', why: str(x.why, 300),
        guard: isObj(x.guard) ? { held: x.guard.held === true, text: str(x.guard.text, 600) } : { held: false, text: '' },
        check: isObj(x.check) ? { state: ['none', 'sent', 'stuck', 'failed', 'ok', 'rejected'].includes(x.check.state) ? x.check.state : 'none', text: str(x.check.text, 600) } : { state: 'none', text: '' },
        // 3.0.0-beta.7: can this printer's print queue be cleared from the dock, and what the last Clear print queue said (the action shows it for two minutes)
        queue: isObj(x.queue) ? { can: x.queue.can === true, text: str(x.queue.text, 300), warn: x.queue.warn === true } : { can: false, text: '', warn: false },
    } : null;
    // 3.0: what each printer resolved to. An action from before 3.0 sends none, and its one printer is printer 1.
    // 3.2.0: what the action says about a Brother VC-500W sticker printer: the connection, its state (idle, printing, asleep, notape, busy, unreachable, error, waiting, unknown) with a
    // sentence, the receipts that wait, the tape left in cm (-1: not known) and the tape it reported in mm (0: not known). Null for any other printer.
    const stickerOf = (x) => isObj(x) ? {
        connection: x.connection === 'usb' ? 'usb' : 'wifi', state: str(x.state, 20), text: str(x.text, 600), queued: Math.max(0, Math.round(num(x.queued))),
        remainCm: Math.round(num(x.remainCm)), tapeSeen: Math.round(num(x.tapeSeen)), tapeMm: Math.round(num(x.tapeMm)),
    } : null;
    // 3.2.0-beta.3: the trays of the driver of a printer on the Windows printer driver, by their names (no list for any other printer, or from an action before trays), and why a list
    // is empty when it is (share: a printer on a network share is not read; later: not read yet)
    const traysOf = (x) => Array.isArray(x) ? x.slice(0, 256).map(RtTrayClean).filter(t => t) : undefined;
    const printers = Array.isArray(d.printers) && d.printers.length ? d.printers.slice(0, RT_MAX_LIMITS.printers).map((x, i) => {
        x = isObj(x) ? x : {};
        return { slot: Math.round(num(x.slot)) || i + 1, name: str(x.name, 300), auto: x.auto === true, note: str(x.note), mode: str(x.mode, 20), queue: queueOf(x.queue), care: careOf(x.care), sticker: stickerOf(x.sticker),
                 trays: traysOf(x.trays), traysNote: str(x.traysNote, 20) };
    }) : [{ slot: 1, name: str(p.name, 300), auto: p.auto === true, note: str(p.note), mode: isObj(d.settings) ? str(d.settings.mode, 20) : '', queue: queueOf(p.queue), care: null, sticker: null }];
    const routing = isObj(d.routing) ? {
        maxPrinters: Math.round(num(d.routing.maxPrinters)), maxRules: Math.round(num(d.routing.maxRules)),
        maxConditions: Math.round(num(d.routing.maxConditions)), maxValueChars: Math.round(num(d.routing.maxValueChars)),
        settingsBytes: Math.max(0, Math.round(num(d.routing.settingsBytes))), settingsLimit: Math.max(0, Math.round(num(d.routing.settingsLimit))),      // 3.0.0-beta.2: how full the settings are
        requestLimit: Math.max(0, Math.round(num(d.routing.requestLimit))),                                                                                // 3.2.0: the most characters one saveSettings may carry (0 from an older action)
    } : null;
    return {
        version: d.version == null ? '' : str(d.version, 40),
        minDock: d.minDock == null ? '' : str(d.minDock, 40),         // the oldest dock page this action works well with (empty from an older action)
        restartNeeded: d.restartNeeded === true,                        // 3.2.0-beta.6: the program came in by an update that needs Streamer.bot restarted (false from an older action)
        settings: isObj(d.settings) ? d.settings : {},
        updateSource: u ? { set: u.set === true, host: str(u.host, 200) } : null,
        printer: {
            name: str(p.name, 300), auto: p.auto === true, note: str(p.note), installed: list(p.installed), drivers: driversOf(p.drivers, list(p.installed)),
            queue: q ? { state: str(q.state, 20), jobs: Math.max(0, Math.round(num(q.jobs))), oldestSec: Math.round(num(q.oldestSec)), text: str(q.text) } : null,
        },
        edge: { state: str(e.state, 40), message: str(e.message) },
        renderer: { version: str(r.version, 40), source: str(r.source, 40), update: str(r.update), sha256: str(r.sha256, 100), signed: r.signed === true },
        last: NormalizeLast(d.last),
        folder: str(d.folder, 400),
        hasPreview: d.hasPreview === true,
        samples: list(d.samples),
        skippedFree: Math.max(0, Math.floor(num(d.skippedFree))),
        avatars: isObj(d.avatars) ? { remembered: Math.max(0, Math.floor(num(d.avatars.remembered))) } : null,     // from 2.4.5 on; null from an older action
        printers,
        routing,
        saveNote: str(d.saveNote, 300),                                   // 3.0.0-beta.2: why the last save was refused or cleaned, or ''
        // 3.0.0-beta.7: Do not cut Hype Trains. active = a Hype Train runs and the printers that have the box print it without cuts (since: when it began, in the clock of the action's PC),
        // printers = the printers that have the box, text = what the last end or reset said (the action shows it for two minutes). Null from an action that does not say.
        hypeUncut: isObj(d.hypeUncut) ? {
            active: d.hypeUncut.active === true, since: str(d.hypeUncut.since, 40), text: str(d.hypeUncut.text, 400), warn: d.hypeUncut.warn === true,
            printers: Array.isArray(d.hypeUncut.printers) ? d.hypeUncut.printers.slice(0, RT_MAX_LIMITS.printers).map(n => Math.round(num(n))).filter(n => n >= 1) : [],
        } : null,
        // 3.0.0-beta.3: the receipt browsers. perBrowser is the setting, wanted the browsers it asks for, running the ones that have started, max the most there are. Null from an older action
        browsers: isObj(d.browsers) ? {
            perBrowser: Math.round(num(d.browsers.perBrowser)), wanted: Math.max(1, Math.round(num(d.browsers.wanted))),
            running: Math.max(0, Math.round(num(d.browsers.running))), max: Math.max(1, Math.round(num(d.browsers.max)) || 16),
        } : null,
        settingsRestored: d.settingsRestored === 'mirror' ? 'mirror' : '',      // 3.0.0-beta.2: the settings came back from the backup copy at the start of this run
        // 3.0.0-beta.9: the image sites the action offers for Images in messages (the id and the name of each, and the most ids the action keeps). Null from an action that does not say.
        // The sites that are on are in settings.imageSites. The page never lists a site of its own: it shows what the action lists.
        imageSites: ImageSitesOf(d.imageSites),
        // 3.0.2: the exchange rates of YouTube High Roller (where they stand, the date of the rates in use) and the currencies the streamer may choose. Null from an action that does not say.
        exchange: ExchangeOf(d.exchange),
        // 3.0.3: how the last Save settings went in the action. Null from an action that does not save the file itself (see BackupOf)
        backup: BackupOf(d.backup),
        // 3.0.4: the triggers whose events a test print may carry with typed values, and the limits of those values. Null from an action that takes none (see TestEventsOf)
        testEvents: TestEventsOf(d.testEvents),
    };
}

// ---- Save settings in the action (3.0.3)
// status.backup: seq (one more for every saveBackup the action handled, saved or refused, and 0 again after each start of the action), ok, file (where the file is, relative to the
// Streamer.bot folder, like status.folder) and error (one sentence, '' when ok). An action that reports it writes the file of Save settings itself. One that does not (before 3.0.3)
// gets the browser download of the older pages. A seq that is not a whole number of 0 or more makes the field unusable, so it counts as missing. The texts are cut and lose their
// control characters, and they only ever go into the page with textContent.
const BACKUP_FILE_MAX = 260;
const BACKUP_ERROR_MAX = 300;

function BackupOf(x) {
    if (!isObj(x) || typeof x.seq !== 'number' || !Number.isSafeInteger(x.seq) || x.seq < 0) return null;
    const text = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '';
    return { seq: x.seq, ok: x.ok === true, file: text(x.file, BACKUP_FILE_MAX), error: text(x.error, BACKUP_ERROR_MAX) };
}

// ---- The exchange rates of YouTube High Roller (3.0.2)
// state: off (no printer allows YouTube High Roller prints, or the amount is 0, so no rates are asked for), checking (none yet, a request is on its way), ok (rates of `date` are in use) or offline
// (none can be used: only a Super Chat in the streamer's own currency can be a YouTube High Roller one). currencies: the ISO 4217 code and a name of each currency the action takes. The page
// lists no currency of its own: the list YouTube currency is the one of the status. Anything else in a currency or a state is left out, so a forged message can only show what fits.
const CURRENCY_CODE = /^[A-Z]{3}$/;
const CURRENCIES_MAX = 300;
const EXCHANGE_STATES = ['off', 'checking', 'ok', 'offline'];

function ExchangeOf(x) {
    if (!isObj(x)) return null;
    const currencies = [];
    if (Array.isArray(x.currencies)) {
        for (const c of x.currencies) {
            if (!isObj(c) || typeof c.code !== 'string' || !CURRENCY_CODE.test(c.code) || currencies.some(o => o.code === c.code)) continue;
            currencies.push({ code: c.code, name: typeof c.name === 'string' && c.name.trim() ? str(c.name, 60).trim() : '' });
            if (currencies.length >= CURRENCIES_MAX) break;
        }
    }
    return {
        state: EXCHANGE_STATES.includes(x.state) ? x.state : '',
        date: typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : '',
        local: typeof x.local === 'string' && CURRENCY_CODE.test(x.local) ? x.local : '',
        currencies,
    };
}

const IMAGE_SITES_MAX = 16;              // the most sites the action lists, and the most ids it keeps in settings.imageSites
const IMAGE_SITE_ID = /^[a-z][a-z0-9]{1,15}$/;      // what the action takes as the id of a site (PbImageSites.CleanIds)

function ImageSitesOf(x) {
    if (!isObj(x) || !Array.isArray(x.available)) return null;
    const max = Math.min(IMAGE_SITES_MAX, Math.max(1, Math.round(num(x.max)) || IMAGE_SITES_MAX));
    const available = [];
    for (const site of x.available) {
        if (!isObj(site) || typeof site.id !== 'string' || site.id.length === 0 || site.id.length > 40) continue;
        if (available.some(a => a.id === site.id)) continue;
        available.push({ id: site.id, name: typeof site.name === 'string' && site.name.trim() ? str(site.name, 60) : site.id });
        if (available.length >= max) break;
    }
    return { available, max };
}

// The ids of a list of sites that are on, as the action keeps them: lower case, each once, in the order given, only what looks like a site id, at most as many as the action keeps.
// Null when the value is not a list of texts (the action refuses such a save, so the page never sends one).
function CleanSiteIds(list) {
    if (!Array.isArray(list) || list.some(x => typeof x !== 'string')) return null;
    const clean = [];
    for (const raw of list) {
        const id = raw.trim().toLowerCase();
        if (!IMAGE_SITE_ID.test(id) || clean.includes(id)) continue;
        if (clean.length >= IMAGE_SITES_MAX) break;
        clean.push(id);
    }
    return clean;
}

function RenderStatus(raw) {
    const s = NormalizeStatus(raw);
    const firstOfConnection = !statusSeen;                 // statusSeen is cleared again on every (re)connect
    pbStatus = s;
    statusSeen = true;
    clearTimeout(statusTimer);
    $('main').hidden = false;
    $('setup-card').hidden = true;

    RenderSummary(s);
    FillSettings(s);
    RenderNotices(s);
    RenderOutdated(s);
    RenderDockOutdated(s);
    RenderUpdateRows(s);
    RenderUpdates();
    RenderFolder(s);

    ConfirmSaves(s);
    CheckRestore(false);
    RenderBackupCard(s);
    CheckBackupSave(s);
    if (previewOpen && s.hasPreview && s.last.at !== lastPreviewAt) Send('preview');
    OfferLegacyPrinter(s);
    FirstStatus(s);
    AskUpdater(s);
    if (firstOfConnection || s.version !== lastReportedVersion) ReportBackendVersion(s);
    if (firstOfConnection) FlushPending();                 // edits that could not be sent before the connection was lost go out now
}

// Tells the router around this page (when there is one) which backend version this dock is talking to. The router swaps this dock page for
// the matching one if it is another page. It is sent after the first status of every connection, and again whenever the version in a
// status differs from the one sent last, which is how a program update reaches the router. It goes only to a page of the same origin.
function ReportBackendVersion(s) {
    lastReportedVersion = s.version;
    try {
        if (window.parent !== window) window.parent.postMessage({ printerBot: 'backend', version: s.version }, location.origin);
    } catch (e) { }
}

// An action with an updater (2.4.0 and later) sends its updater state after a status, and this asks for it once per connection in case that
// message came before this page was listening. An older action would log "unknown command" for it, so it is only sent to an action
// that is known to have an updater.
function AskUpdater(s) {
    if (updaterAsked || !actionId || IsOlderVersion(s.version, LOADER_SINCE)) return;
    updaterAsked = true;
    Send('updaterStatus');
}

// The first status after a connect. If the action has no update source yet, this dock's folder becomes it (once). If the source
// is already this dock, the same address is sent again and the action treats that as a request to look for an update, nothing more.
// It first reads a 150-byte version.json, and a downloaded renderer is used only if the author signed it. This is how a renderer
// on the dock's web host is picked up the next time the dock connects. A different source is shown but never changed without a click.
function FirstStatus(s) {
    if (sourceConfigureDone || !actionId) return;           // (no action id yet: this status is someone else's broadcast, ours follows)
    sourceConfigureDone = true;
    if (IsOlderVersion(s.version, FRONTEND_VERSION)) return;   // an older action belongs to an older dock page (the router swaps to it). It keeps its own update source.
    if (!s.updateSource || !FOLDER_URL) return;
    if (s.updateSource.set === false || (s.updateSource.set === true && s.updateSource.host === location.host)) Send('configure', { rendererUrl: FOLDER_URL });
}

// The status line and the rows under it. It is cheap and safe to redraw at any time.
function RenderSummary(s) {
    const mode = str(s.settings.mode, 40);
    const png = mode === 'png';
    const printerOk = png || !!s.printer.name;
    const q = s.printer.queue;
    const queueBad = !png && !!s.printer.name && !!q && (q.state === 'error' || q.state === 'stale');
    const many = PrintersStatusRows(s);                       // null with one printer: the rows and the line below are then the ones of every version before 3.0
    const manyProblem = many ? PrintersProblem(s) : '';
    if (s.edge.state === 'error') SetStatusLine('bad', `Can't start Edge: ${s.edge.message}`);
    else if (manyProblem) SetStatusLine('warn', manyProblem);
    else if (!many && !printerOk) SetStatusLine('warn', 'No printer found. Install your receipt printer, or pick one below.');
    else if (!s.last.ok && s.last.error) SetStatusLine('bad', `Last print failed: ${s.last.error}`);
    else if (!many && queueBad) SetStatusLine('warn', q.text || (q.state === 'stale' ? 'Receipts are waiting in the print queue.' : 'The print queue has a problem.'));
    else SetStatusLine('ok', 'Ready');

    let lastText = 'nothing yet';
    if (s.last.at) {
        const when = new Date(s.last.at);
        lastText = `${s.last.source}, ${s.last.ms} ms${isNaN(when.getTime()) ? '' : ', ' + when.toLocaleTimeString()}`;
        if (many && s.last.to.length) lastText += `, ${PrintersLastText(s.last.to)}`;
    }

    const rows = [];
    if (many) many.forEach(r => rows.push(r));
    else {
        rows.push(['Printer', png ? 'not needed (preview only)'
            : s.printer.name ? h('span', null, s.printer.name, s.printer.auto ? h('span', { class: 'muted' }, ' (auto-detected)') : null) : 'none found']);
        rows.push(['Output', modeName(mode)]);
    }
    rows.push(['Last print', lastText]);
    if (s.printer.note && !many) rows.push(['Note', s.printer.note]);
    if (!many && !png && s.printer.name && q) {
        const text = q.text || ({ ok: 'looks healthy', unknown: 'not known' }[q.state] || q.state || 'not known');
        rows.push(['Print queue', h('span', { class: 'queue-' + (['ok', 'error', 'stale'].includes(q.state) ? q.state : 'unknown') }, text)]);
    }
    rows.push(['Renderer', RendererSummary(s.renderer)]);
    if (legacyActionsFound) rows.push(['Heads up', h('span', null, 'Old ', h('b', null, 'Printer Bot | Events'), ' / ', h('b', null, 'Print Routine'), ' actions still exist. Disable them or events print twice.')]);

    const kids = [];
    for (const [label, value] of rows) kids.push(h('dt', null, label), h('dd', null, value));
    $('status-grid').replaceChildren(...kids);
}

// "v202601011200 (built in, signed, sha 0123456789ab, renderer is up to date)"
function RendererSummary(r) {
    const bits = [hasOwn(SOURCE_NAME, r.source) ? SOURCE_NAME[r.source] : r.source];
    if (r.signed) bits.push(h('span', { class: 'signed' }, 'signed'));
    if (r.sha256) bits.push('sha ' + r.sha256.slice(0, 12));
    if (r.update) bits.push(r.update);
    const inner = [];
    bits.forEach((b, i) => { if (i) inner.push(', '); inner.push(b); });
    return h('span', null, 'v' + r.version + ' ', h('span', { class: 'muted' }, '(', ...inner, ')'));
}

// The printer list and selects are rebuilt only when their content changed, and never under a pending edit.
let printerSignature = '', sampleSignature = '';

function FillSettings(s) {
    const st = s.settings;
    SettleInFlight(st);
    const skip = (id) => $(id) === document.activeElement || Protected(id);      // being typed in, or an edit not saved/confirmed yet
    const setValue = (id, value) => { if (!skip(id) && $(id).value !== String(value)) $(id).value = value; };
    const setCheck = (id, value) => { if (!skip(id)) $(id).checked = !!value; };

    // printer list: auto-detect + everything installed (+ the saved name if it is no longer installed)
    const select = $('printer');
    const saved = str(st.printer, 300);
    const names = [...s.printer.installed];
    if (saved && !names.some(n => n.toLowerCase() === saved.toLowerCase())) names.unshift(saved);
    const autoLabel = `Auto-detect${s.printer.auto && s.printer.name ? ` (${s.printer.name})` : ''}`;
    const signature = JSON.stringify([autoLabel, names, s.printer.installed, s.printer.drivers || null]);
    if (signature !== printerSignature && select !== document.activeElement) {
        const chosen = select.value;                      // an edit that is still pending must survive the rebuild
        printerSignature = signature;
        select.replaceChildren(new Option(autoLabel, ''), ...names.map(n => new Option(PrinterQueueLabel(n, s.printer), n)));
        select.value = saved;
        if (Protected('printer')) select.value = chosen;
        if (select.selectedIndex < 0) select.value = saved;
    }
    else if (!skip('printer') && select.value !== saved) select.value = saved;
    const autoOption = select.options[0];
    if (autoOption && autoOption.value === '' && autoOption.text !== autoLabel) autoOption.text = autoLabel;

    setValue('mode', str(st.mode, 40));
    // The paper of printer 1: 80 mm, 58 mm or Letter. Letter needs the Windows printer driver or the preview, so a status that says Letter with thermal output (a file written by hand) shows the roll.
    if (!(Protected('paperWidthMm') || Protected('paperSize') || $('paperWidthMm') === document.activeElement)) {
        const size = str(st.paperSize, 20);                                       // 3.2.0-beta.2: letter, or the card of 4 x 6 in, both pages of the Windows printer driver
        const paper = (size === 'letter' || size === '4x6') && $('mode').value !== 'escpos' ? size : (num(st.paperWidthMm) >= 70 ? '80' : '58');
        if ($('paperWidthMm').value !== paper) $('paperWidthMm').value = paper;
    }
    setValue('printProfile', str(st.printProfile, 20) === 'color' ? 'color' : 'bw');
    setValue('letterLayout', RtLayoutOf(st.letterLayout));           // 3.0.0-beta.10: only the exact texts scaled and message are a layout, anything else shows as scaled (the row itself shows with Letter paper, RtRenderPaper1)
    setValue('letterImageFit', RtFitOf(st.letterImageFit));         // 3.0.0: only the exact texts fill, fit and stretch are a fit, anything else shows as fit (the row shows with the large layout on Letter paper, RtRenderPaper1)
    // 3.2.0-beta.3: the tray of printer 1, in a list of the trays of its driver (the row shows for a page on the Windows printer driver, RtRenderPaper1). An action from before sends none.
    if (hasOwn(st, 'paperTray') && !(Protected('paperTray') || $('paperTray') === document.activeElement)) RtFillTraySelect($('paperTray'), 1, RtTrayClean(st.paperTray), RT_TRAY_DEFAULT);
    setValue('dither', str(st.dither, 40));
    setValue('cut', str(st.cut, 40));
    setValue('feedDots', num(st.feedDots));
    // 3.2.0: the Brother VC-500W rows of printer 1 (an action from before sends none: the rows keep their defaults and are only shown for that output)
    if (hasOwn(st, 'vcAddress')) {
        setValue('vcConnection', st.vcConnection === 'usb' ? 'usb' : 'wifi');
        if (!(Protected('vcAddress') || $('vcAddress') === document.activeElement)) setValue('vcAddress', str(st.vcAddress, 253));
        setValue('vcTapeMm', RtVcTapeOf(st.vcTapeMm));
        setValue('vcQuality', st.vcQuality === 'normal' ? 'normal' : 'vivid');
        setValue('vcCut', RT_VC_CUTS.includes(st.vcCut) ? st.vcCut : 'full');
    }
    setValue('highRollerBits', num(st.highRollerBits));
    setValue('highRollerBitsPerInch', num(st.highRollerBitsPerInch) || 0);
    setValue('highRollerMaxInches', num(st.highRollerMaxInches) || 0);
    if (hasOwn(st, 'youtubeHighRollerAmount')) setValue('youtubeHighRollerAmount', num(st.youtubeHighRollerAmount));                       // 3.0.2
    if (hasOwn(st, 'youtubeHighRollerAmountPerInch')) setValue('youtubeHighRollerAmountPerInch', num(st.youtubeHighRollerAmountPerInch));
    RenderCurrencies(s);
    setValue('freePrintsPerMinute', num(st.freePrintsPerMinute));
    if (hasOwn(st, 'printersPerBrowser')) setValue('printersPerBrowser', num(st.printersPerBrowser));
    if (hasOwn(st, 'hypeEndWaitSeconds')) setValue('hypeEndWaitSeconds', num(st.hypeEndWaitSeconds));
    RenderPerBrowser(s);
    setCheck('ignoreTestTriggers', st.ignoreTestTriggers);
    setCheck('keepDebugFiles', st.keepDebugFiles);
    setCheck('allowHostedUpdates', st.allowHostedUpdates);
    setCheck('autoUpdateCore', st.autoUpdateCore);
    setCheck('prereleaseUpdates', st.prereleaseUpdates);
    setCheck('hideLinks', st.hideLinks);
    setCheck('hypeTrain', st.hypeTrain);
    setCheck('allowHighRoller', st.allowHighRoller);
    setCheck('allowImages', st.allowImages);
    setCheck('allowYouTubeHighRoller', st.allowYouTubeHighRoller === true);         // 3.0.2: off unless the action says true
    setCheck('uncutHypeTrain', st.uncutHypeTrain);
    RenderImageSites(s);

    // An action imported before a setting existed doesn't report it and would silently ignore it. Disable the control and say why.
    for (const id of SETTING_CONTROLS) {
        const supported = hasOwn(st, id);
        $(id).disabled = !supported;
        if (supported) $(id).removeAttribute('title');
        else $(id).title = 'The Printer Bot action is older than this dock. Import it again to use this setting.';
    }
    // Installing by itself needs program updates to be switched on in the Updates card
    if (hasOwn(st, 'autoUpdateCore') && HostedUpdatesOff(s)) {
        $('autoUpdateCore').disabled = true;
        $('autoUpdateCore').title = HOSTED_OFF_TEXT;
    }
    RenderBitsPerInchExample();
    RenderExchange(s);

    const skipped = $('skipped-free');
    skipped.hidden = !(s.skippedFree > 0);
    skipped.textContent = `Skipped by that limit: ${s.skippedFree}`;
    RenderAvatarCache(s);
    RenderAdvancedHint();

    const mode = $('mode').value;
    ApplyModeVisibility(mode);
    $('mode-description').textContent = modeText(mode);

    // The list of the Test card: the samples of the action, and from 3.0.4 an entry for each trigger that has no sample (TestEntries)
    const sample = $('sample');
    const entries = TestEntries(s);
    const samplesNow = JSON.stringify(entries);
    if (samplesNow !== sampleSignature) {
        sampleSignature = samplesNow;
        const keep = sample.value;
        sample.replaceChildren(...TestEntryGroups(entries));
        if (entries.includes(keep)) sample.value = keep;
    }
    RenderTestEditor();
    PrintersRender(s);
}

function ApplyModeVisibility(mode) {
    document.querySelectorAll('[data-only]').forEach(el => { el.hidden = el.dataset.only !== mode; });
    // 3.2.0: a sticker printer on Wi-Fi has an address in place of a Windows print queue; on USB its print queue is chosen in the printer list, as for any printer
    $('printer').closest('.setting').hidden = mode === 'png' || (mode === 'vc500w' && $('vcConnection').value === 'wifi');
    RtRenderPaper1();
}

function SameValue(a, b) {
    if (b !== null && typeof b === 'object') return CanonicalJson(a) === CanonicalJson(b);       // the same content, whatever the order of the keys
    return typeof b === 'boolean' ? !!a === b : String(a) === String(b);
}
function Protected(id) { return hasOwn(pendingSettings, id) || hasOwn(inFlight, id); }
function SettleInFlight(st) {
    const now = Date.now();
    for (const id of Object.keys(inFlight)) {
        if (now - inFlight[id].at > IN_FLIGHT_MS || (hasOwn(st, id) && SameValue(st[id], inFlight[id].value))) delete inFlight[id];
    }
}

// The imported action is older than this dock: one note near the top of Settings, plus the per-control switch-off in FillSettings.
// An action with an updater is brought up to date from the Updates card. One without an updater has to be imported again.
function RenderOutdated(s) {
    const versionOld = !s.version || IsOlderVersion(s.version, minActionVersion);
    const missingControl = SETTING_CONTROLS.some(id => !hasOwn(s.settings, id)) || !hasOwn(s.settings, 'extraPrinters') || !hasOwn(s.settings, 'routing') || !hasOwn(s.settings, 'paperSize');
    $('action-outdated').hidden = !(versionOld || missingControl);
    const updatable = ActionHasUpdater(s);
    $('outdated-import').hidden = updatable;
    $('outdated-update').hidden = !updatable;
    RenderAdvancedHint();
}

// The opposite case: this dock page is older than the action says it should be. One note, and nothing is switched off.
function RenderDockOutdated(s) {
    $('dock-outdated').hidden = !(s.minDock && IsOlderVersion(FRONTEND_VERSION, s.minDock));
}


//////////////////////
// UPDATE SOURCE    //
//////////////////////

let useDockArmed = false, useDockTimer = null, checkingUpdate = false, resettingRenderer = false;

function DisarmUseDock() {
    useDockArmed = false;
    clearTimeout(useDockTimer);
    $('update-use-button').textContent = 'Use this dock';
    $('update-use-button').classList.remove('confirming');
}

// An action older than this dock page belongs to an older dock page, which the router shows for it. This page leaves its update source alone.
// Without that, opening this page directly against such an action would hand the action this folder's renderer.
const ACTION_OLDER_TEXT = 'The Printer Bot action is older than this dock page. Open the dock from its main address to get the page that matches it.';
const ActionIsOlder = () => !!pbStatus && IsOlderVersion(pbStatus.version, FRONTEND_VERSION);

function RenderUpdateRows(s) {
    const u = s.updateSource;
    const supported = !!u;                           // an action from before this feature sends no updateSource
    const older = IsOlderVersion(s.version, FRONTEND_VERSION);
    const here = !!u && u.set && u.host === location.host;
    const other = !!u && u.set && !here;
    let text;
    if (!supported) text = 'unknown (the Printer Bot action is older than this dock)';
    else if (!u.set) text = 'not set yet';
    else if (here) text = 'this dock';
    else text = `another address: ${u.host}`;
    $('update-source-state').textContent = 'Updates come from: ' + text;

    const check = $('update-check-button'), use = $('update-use-button');
    check.disabled = !supported || older || !FOLDER_URL || other || checkingUpdate;
    check.title = !supported ? 'The Printer Bot action is older than this dock. Import it again to use this.'
        : older ? ACTION_OLDER_TEXT
            : !FOLDER_URL ? 'Open the dock from a web address to use this.'
                : other ? 'Updates come from another address. Press "Use this dock" first.' : '';
    use.hidden = !other;
    use.disabled = older || !FOLDER_URL;
    use.title = older ? ACTION_OLDER_TEXT : '';
    if (!other && useDockArmed) DisarmUseDock();

    $('renderer-detail').replaceChildren(RendererSummary(s.renderer));
    const reset = $('renderer-reset-button');
    reset.disabled = !supported || resettingRenderer;
    reset.title = supported ? '' : 'The Printer Bot action is older than this dock. Import it again to use this.';
}

function CheckForUpdates() {
    if (!FOLDER_URL || checkingUpdate || ActionIsOlder()) return;
    const button = $('update-check-button');
    checkingUpdate = true;
    button.disabled = true;
    button.textContent = 'Checking\u2026';
    // The check runs in the action and its answer arrives later as a status (see the Renderer rows). This timer just resets the button.
    setTimeout(() => { checkingUpdate = false; button.textContent = 'Check layouts'; if (pbStatus) RenderUpdateRows(pbStatus); }, 3000);
    Send('configure', { rendererUrl: FOLDER_URL });
}

// Changing an existing update source takes two clicks: the first arms the button, and a second click within 5 s does it.
function UseThisDock() {
    if (!FOLDER_URL || ActionIsOlder()) return;
    const button = $('update-use-button');
    if (!useDockArmed) {
        useDockArmed = true;
        button.textContent = 'Are you sure? Click again';
        button.classList.add('confirming');
        useDockTimer = setTimeout(DisarmUseDock, 5000);
        return;
    }
    DisarmUseDock();
    Send('configure', { rendererUrl: FOLDER_URL, force: true });
}

function ResetRenderer() {
    if (resettingRenderer) return;
    const button = $('renderer-reset-button');
    resettingRenderer = true;
    button.disabled = true;
    button.textContent = 'Resetting\u2026';
    setTimeout(() => { resettingRenderer = false; button.textContent = 'Reset to built-in renderer'; if (pbStatus) RenderUpdateRows(pbStatus); }, 2000);
    Send('resetRenderer');
}

// Viewer pictures (Advanced, from 2.4.5): the action remembers each viewer's picture address, and for two hours a name it could not find.
// The status says how many it remembers, and Clear picture cache (clearAvatars) makes it forget them all. An action from before 2.4.5 does not
// report the count and does not know the command, so the button is off with the usual "older than this dock" title.
let clearingAvatars = false;
function RenderAvatarCache(s) {
    const button = $('clear-avatars-button'), count = $('avatar-cache-count');
    const supported = !!s.avatars;
    button.disabled = !supported || clearingAvatars;
    if (supported) button.removeAttribute('title');
    else button.title = 'The Printer Bot action is older than this dock. Import it again to use this button.';
    count.textContent = !supported ? '' : s.avatars.remembered === 1 ? '1 viewer remembered' : `${s.avatars.remembered} viewers remembered`;
}

function ClearAvatars() {
    if (clearingAvatars || !pbStatus || !pbStatus.avatars) return;
    const button = $('clear-avatars-button');
    clearingAvatars = true;
    button.disabled = true;
    button.textContent = 'Clearing\u2026';
    setTimeout(() => { clearingAvatars = false; button.textContent = 'Clear picture cache'; if (pbStatus) RenderAvatarCache(pbStatus); }, 2000);
    Send('clearAvatars');
}


/////////////
// UPDATES //
/////////////

// The Updates card shows the state of the action's own updater (the pb:'updater' message) and sends checkCore, updateCore and rollbackCore.
// An update is installed only after two clicks on the Update button, or by the action itself when the person switched on automatic installs.
// The updater sends fixed short codes for its errors, and this page turns each into a sentence.

const UPDATE_STATES = ['idle', 'checking', 'current', 'available', 'downloading', 'verifying', 'waiting', 'installing', 'installed', 'failed', 'paused', 'unavailable', 'reimport'];
const WORKING_STATES = ['downloading', 'verifying', 'waiting', 'installing'];      // an update is on its way: nothing else can be started
const HOSTED_OFF_TEXT = 'Turn on "Download updates" below first.';
const ARM_MS = 5000;                  // the first click on Update stays armed this long
const PAUSE_MS = 4000;                // a button that sent a command stays off this long, or until the updater answers

// The short form of a state, for the summary line of the closed card (the line after the heading Updates)
const UPDATED_BRIEF = 'Updated. Reload the dock';
// An update needs no restart of Streamer.bot (the owner, 15 October 2026): the updater switches the program while it runs. A page that loaded after the install of the
// running program is the new page already, so it asks for no Reload dock. The time of the install comes from the updater (core.installed, UTC, whole seconds).
const PAGE_LOADED_MS = Date.now();
function LoadedAfterInstall(up) { const t = up && up.core ? Date.parse(up.core.installed) : NaN; return Number.isFinite(t) && t <= PAGE_LOADED_MS; }
function SetUpdatesHint(text) { $('updates-hint').textContent = text; }

// 3.2.0-beta.6 (the owner, 18 October 2026): the notice at the very top of the dock after an update, only while it is needed. Restart Streamer.bot: while the program
// that runs says so (status.restartNeeded, which it says only when it came in by an update and its version needs a restart), until Streamer.bot starts the code
// again. Reload dock: while this page is older than the program the updater installed (the condition of Reload dock in the Updates card).
const UpdateRestartText = (v) => `Printer Bot was updated to ${v}. Restart Streamer.bot now: this update needs it to work properly. Then press Reload dock.`;
const UpdateReloadText = (v) => `Printer Bot was updated to ${v}. Press Reload dock to open the dock page of the new version. Streamer.bot needs no restart.`;
function RenderUpdateNotice(state, up) {
    const restart = !!pbStatus && pbStatus.restartNeeded === true;
    const reload = state === 'installed' && !LoadedAfterInstall(up);
    const version = str(restart ? RunningVersion() : (up && up.core && up.core.version) || OfferedVersion() || RunningVersion(), 40);
    $('update-notice-text').textContent = restart ? UpdateRestartText(version) : reload ? UpdateReloadText(version) : '';
    $('update-notice').hidden = !(restart || reload);
}

// Texts for an updater of revision 2: a version that failed before is paused and offered again, and Reinstall downloads the program again
const FailedBeforeText = (version) => `Version ${version} was paused after a crash or a failed start on this PC. The button below downloads a fresh copy and tries it again.`;
const REINSTALL_OFF_TEXT = 'Reinstall works when the downloaded program is the newest version, or when the newest version failed before.';
const OfferKey = (version, again) => version + (again ? ' again' : '');        // what a first click on the Update button was about

const UPDATE_ERRORS = {
    'no-source': 'Printer Bot does not know where to get updates yet. Open the dock from its web address and connect once.',
    'off': 'Updates are switched off. Turn on "Download updates" below.',
    'unreachable': 'The update host did not answer. Check your internet connection.',
    'missing': 'This dock host does not offer program updates.',
    'signature': 'The update was not signed by the author, so it was refused.',
    'damaged': 'The downloaded update was damaged, so it was refused.',
    'format': 'The update came in a format this Printer Bot cannot read.',
    'old-loader': 'This update needs a newer updater. Import Printer Bot once more to get it.',
    'blocked': 'Windows or a security program would not let Printer Bot load the update.',
    'start-failed': 'The new version did not start, so the old one is running again.',
    'disk': 'Printer Bot could not write the update to disk.',
    'busy': 'Printer Bot is busy with a receipt. Try again in a moment.',
    'paused': 'The author has paused updates.',
    'rejected': 'This version failed to start on this PC before, so it is not tried again.',
};

// update.refused is '' or 'wait'. The updater sets 'wait' when it turned down a click on Update because it tried an update a moment ago
// (a minute after a failure, or too many tries in an hour). The reason of the failure stays in update.error, so this has a note of its own.
const REFUSED_WAIT_TEXT = 'Printer Bot tried this a moment ago. Wait a minute, then try again.';

// The sentence for an error code. "http 503" becomes a sentence with the number. Any other code gets a general sentence.
function UpdateErrorText(code) {
    if (hasOwn(UPDATE_ERRORS, code)) return UPDATE_ERRORS[code];
    const m = /^http (\d{3})$/.exec(code);
    if (m) return `The update host answered with error ${m[1]}.`;
    return code ? 'The updater reported a problem this dock does not know.' : 'No reason was given.';
}

// Only strings and finite numbers go into the page. Anything else, an object that came from a forged message for example, becomes ''.
const ustr = (v, max) => typeof v === 'string' ? v.slice(0, max) : (typeof v === 'number' && Number.isFinite(v) ? String(v).slice(0, max) : '');

// update.reimport is null, or says what a newer updater needs: { reason, version, notes }. A text or true is accepted as well.
// An empty text, false, a number and anything else mean there is nothing to import.
function NormalizeReimport(r) {
    if (r === true) return { reason: '', version: '', notes: '' };
    if (typeof r === 'string') return r ? { reason: '', version: '', notes: ustr(r, 1000) } : null;
    if (!isObj(r)) return null;
    return { reason: ustr(r.reason, 20), version: ustr(r.version, 40), notes: ustr(r.notes, 1000) };
}

// Whatever arrives is reduced to strings, numbers and booleans of the right shape before anything is drawn, like NormalizeStatus does.
// An unknown state becomes 'unknown'. A flag the updater leaves out counts as false.
function NormalizeUpdater(d) {
    const l = isObj(d.loader) ? d.loader : {};
    const c = isObj(d.core) ? d.core : {};
    const u = isObj(d.update) ? d.update : {};
    const k = isObj(d.can) ? d.can : {};
    return {
        loader: { api: Math.max(0, Math.round(num(l.api))), rev: Math.max(0, Math.round(num(l.rev))), embedded: ustr(l.embedded, 40) },
        core: { version: ustr(c.version, 40), source: ustr(c.source, 40), pinned: c.pinned === true, sha256: ustr(c.sha256, 100), installed: ustr(c.installed, 40) },
        update: {
            state: typeof u.state === 'string' && UPDATE_STATES.includes(u.state) ? u.state : 'unknown',
            latest: ustr(u.latest, 40),
            notes: ustr(u.notes, 1000),
            checked: ustr(u.checked, 40),
            progress: Math.min(100, Math.max(0, Math.round(num(u.progress)))),
            error: ustr(u.error, 60),
            minDock: ustr(u.minDock, 40),
            reimport: NormalizeReimport(u.reimport),
            rejected: Array.isArray(u.rejected) ? u.rejected.slice(0, 20).map(x => ustr(x, 40)) : [],
            auto: u.auto === true,
            autoInstalled: ustr(u.autoInstalled, 40),
            refused: ustr(u.refused, 20),
            failedBefore: u.failedBefore === true,       // revision 2: update.latest crashed or failed to start here before
        },
        can: { check: k.check === true, update: k.update === true, rollback: k.rollback === true, reinstall: k.reinstall === true },
    };
}

// An action from 2.4.0 on has an updater. It counts as having one as soon as it has sent its updater message, and before that by its version.
const ActionHasUpdater = (s) => pbUpdater !== null || !IsOlderVersion(s.version, LOADER_SINCE);
const HostedUpdatesOff = (s) => s.settings.allowHostedUpdates === false;
const RunningVersion = () => (pbUpdater && pbUpdater.core.version) || (pbStatus && pbStatus.version) || '';

// An updater of revision 2 or later can try a version again. The two fields it adds (update.failedBefore and can.reinstall) count only from such an updater.
const HasRetry = () => pbUpdater !== null && pbUpdater.loader.rev >= RETRY_SINCE_REV;

// The version the Update button would install: the latest the updater verified, when it is newer than the running one. Otherwise ''.
function OfferedVersion() {
    const u = pbUpdater && pbUpdater.update;
    if (!u || !ParseVersion(u.latest)) return '';
    return IsOlderVersion(RunningVersion(), u.latest) ? u.latest : '';
}

// The offered version crashed or failed to start on this PC before. The button then reads "Try <version> again" and asks for a fresh download (force).
const TryAgainOffered = () => HasRetry() && pbUpdater.update.failedBefore && OfferedVersion() !== '';

// The version the Reinstall button would install: update.latest, when the updater says it can (can.reinstall) and nothing is under way. Otherwise ''.
function ReinstallVersion() {
    if (!HasRetry() || !pbUpdater.can.reinstall || !pbStatus || HostedUpdatesOff(pbStatus)) return '';
    if (pbUpdater.update.state === 'checking' || WORKING_STATES.includes(pbUpdater.update.state)) return '';
    return ParseVersion(pbUpdater.update.latest) ? pbUpdater.update.latest : '';
}

// The updater sends times as ISO text (2026-10-12T18:20:00Z). A browser also reads a bare "5" as a date, so the shape is checked first.
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// "just now", "2 minutes ago", "3 hours ago", "4 days ago". An empty or unreadable time is "not yet".
function AgeText(iso) {
    const t = ISO_TIME.test(iso) ? Date.parse(iso) : NaN;
    if (isNaN(t)) return 'not yet';
    const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
    const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    if (sec < 10) return 'just now';
    if (sec < 60) return plural(sec, 'second');
    const min = Math.floor(sec / 60);
    if (min < 60) return plural(min, 'minute');
    const hours = Math.floor(min / 60);
    return hours < 24 ? plural(hours, 'hour') : plural(Math.floor(hours / 24), 'day');
}

function TimeText(iso) {
    const t = ISO_TIME.test(iso) ? new Date(iso) : null;
    return t && !isNaN(t.getTime()) ? t.toLocaleTimeString() : '';
}

const CoreSourceLabel = (core) => core.source === 'embedded' ? 'built in' : core.source === 'downloaded' ? 'downloaded' : core.source || 'unknown source';

function CoreSourceText(core) {
    const bits = [CoreSourceLabel(core)];
    if (core.pinned) bits.push('kept until you update');
    return bits.join(', ');
}

// What the card says about the running version after a failed update. Every failure before the swap changes nothing. A failed start can leave
// another version running (a downloaded version that keeps raising errors is dropped for the built-in one), so that failure names the version that runs now.
function FailedTail(u, core, running) {
    if (u.error === 'start-failed') return ` Printer Bot is running ${running || 'an unknown version'} (${CoreSourceLabel(core)}).`;
    return ' Nothing changed. The previous version keeps running.';
}

let updateArmed = false, updateArmedFor = '', updateArmTimer = null, updateSending = false;
let reinstallArmed = false, reinstallArmedFor = '', reinstallArmTimer = null, reinstallSending = false;       // the same two clicks for Reinstall
let checkingCore = false, rollbackPause = false;
let idleVersion = '';                 // the version that ran in the last message of a calm state (no download, check or switch under way). '' until this page has seen one.
let calmCore = null;                  // { version, source } of the core in the last message of a calm state, before the message that is drawn now
let lastUpdaterState = null;          // the state of the last pb:'updater' message of this connection (null until the first one)
let lastResetCheckAt = 0;             // when the dock last asked for a check because the updater started again in the state idle
const RESET_CHECK_GAP_MS = 60000;
let droppedFrom = '';                 // the version of a downloaded core that the updater dropped for the built-in one in the message that is drawn now
let rollbackAskedAt = 0, rollbackWorking = false;      // a rollback the person asked for: the time of the click, and whether the updater has been busy with it since
let rollbackFromKey = '';             // the core that ran when the person asked for the rollback (version and source)
const ROLLBACK_WINDOW_MS = 30000;
const RollbackUnderWay = () => rollbackAskedAt > 0 && Date.now() - rollbackAskedAt < ROLLBACK_WINDOW_MS;
const CoreKey = (core) => `${core.version}|${core.source}`;

// The text while the core is switched. The version is named only for an update to a newer version than the one that ran before. A rollback keeps
// the version of the offer it started from in the message, so it says "Switching versions\u2026" in place of a version that is not the target.
// A page that has seen no calm state yet (it was opened in the middle of a switch) cannot tell an update from a rollback and says "Switching versions\u2026" too.
function SwitchingText(latest) {
    const newer = !!ParseVersion(latest) && idleVersion !== '' && !RollbackUnderWay() && IsOlderVersion(idleVersion, latest);
    return newer ? `Switching to ${latest}\u2026` : 'Switching versions\u2026';
}

function ResetUpdateArm() {
    updateArmed = false;
    updateArmedFor = '';
    clearTimeout(updateArmTimer);
}

function ResetReinstallArm() {
    reinstallArmed = false;
    reinstallArmedFor = '';
    clearTimeout(reinstallArmTimer);
}

function RenderUpdater(raw) {
    const before = lastUpdaterState;        // the state of the message before this one on this connection (null for the first one)
    pbUpdater = NormalizeUpdater(raw);
    const incoming = pbUpdater.update;
    lastUpdaterState = incoming.state;
    droppedFrom = '';
    if (WORKING_STATES.includes(incoming.state)) rollbackWorking = true;
    else {
        // A downloaded core that is replaced by the built-in one with a failed start and no word from the person was dropped (it kept raising errors).
        if (incoming.state === 'failed' && incoming.error === 'start-failed' && calmCore && calmCore.source === 'downloaded' && pbUpdater.core.source === 'embedded') droppedFrom = calmCore.version;
        idleVersion = pbUpdater.core.version;
        calmCore = { version: pbUpdater.core.version, source: pbUpdater.core.source };
        // The rollback that was asked for is over when the updater was busy with it and is calm again, or when a calm message shows another core
        // (with the production throttle the updater folds the whole switch into one message and no busy state is ever sent).
        if (rollbackAskedAt > 0 && (rollbackWorking || CoreKey(pbUpdater.core) !== rollbackFromKey)) rollbackAskedAt = 0;
        rollbackWorking = false;
    }
    checkingCore = false;                   // an answer ends the pause a button keeps after its click
    rollbackPause = false;
    updateSending = false;
    reinstallSending = false;
    if (!pbStatus) return;                  // the status is drawn first, and it draws this as well
    RenderOutdated(pbStatus);
    RenderUpdates();
    AskAfterReset(before);
}

// Streamer.bot unloads the code of Printer Bot after quiet spells and loads it again when something needs it. The updater then starts in the state idle
// and has forgotten its offer. It checks by itself only when its last check is older than 6 hours, and when a dock connects. A dock that stays connected
// would show "Checking soon." for hours, and an "Update available" card would silently turn into it. So the first idle message that follows another state
// makes the dock ask for one check. Not for the first message of a connection (the updater checks then by itself), not while Download updates is off,
// not for an action without an updater, not more than once a minute, and not again before the state has left idle and come back.
function AskAfterReset(before) {
    const u = pbUpdater.update;
    if (u.state !== 'idle' || before === null || before === 'idle') return;
    if (HostedUpdatesOff(pbStatus) || u.error === 'off' || IsOlderVersion(pbStatus.version, LOADER_SINCE) || $('update-main').hidden) return;
    if (!pbUpdater.can.check || Date.now() - lastResetCheckAt < RESET_CHECK_GAP_MS) return;
    lastResetCheckAt = Date.now();
    Send('checkCore');                      // the card keeps its text and its buttons until the updater answers
}

// " (prerelease)" behind the version of a prerelease, nothing behind a release
const PreText = (v) => IsPrereleaseVersion(v) ? ' (prerelease)' : '';

// The switch for prerelease versions. A prerelease is a test version that the author publishes before a release. It can have mistakes, the updater
// never installs one by itself, and it offers one only while this switch is on. The switch needs an updater of revision 3, because an older one ignores
// the setting, and it needs "Download updates", because nothing is fetched without it.
function RenderPrerelease(s, up, hostedOff) {
    const box = $('prereleaseUpdates'), hint = $('prerelease-hint');
    const known = hasOwn(s.settings, 'prereleaseUpdates');
    const tooOld = !!up && up.loader.rev < PRERELEASE_SINCE_REV;
    let why = '';
    if (!known) why = 'The Printer Bot action is older than this dock. Import it again to use this setting.';
    else if (tooOld) why = 'The updater inside this Printer Bot is older than this setting needs. Import Printer Bot once more to get the newer updater. Your settings stay.';
    else if (hostedOff) why = HOSTED_OFF_TEXT;
    box.disabled = why !== '';
    if (why) box.title = why; else box.removeAttribute('title');
    let text = '';
    if (known && tooOld) text = why;
    else if (known && !hostedOff && !box.checked && IsPrereleaseVersion(RunningVersion())) text = 'This Printer Bot is a prerelease. Switch this on to be offered the next prerelease. Without it you are offered releases only.';
    hint.textContent = text;
    hint.hidden = text === '';
}

// The note at the top of the page. It shows while this dock page or the running Printer Bot is a prerelease, and names the version.
function RenderPrereleaseNote() {
    const running = RunningVersion();
    const version = IsPrereleaseVersion(running) ? running : IsPrereleaseVersion(FRONTEND_VERSION) ? FRONTEND_VERSION : '';
    $('prerelease-note').hidden = version === '';
    $('prerelease-note-text').textContent = version ? `Prerelease ${version}. This is a test version of Printer Bot and it can have mistakes.` : '';
}

// The whole card, from the last status and the last updater message. It is cheap and safe to redraw at any time.
function RenderUpdates() {
    RenderPrereleaseNote();
    if (!pbStatus) return;
    const s = pbStatus, up = pbUpdater;
    const hasUpdater = ActionHasUpdater(s);
    const running = RunningVersion();
    const offered = OfferedVersion();
    const state = up ? up.update.state : 'idle';
    const hostedOff = HostedUpdatesOff(s);
    const working = WORKING_STATES.includes(state);
    const retry = HasRetry();                                       // an updater of revision 2 or later can try a version again

    // what runs now
    const runningPre = IsPrereleaseVersion(running);
    const runningNote = up ? ` (${[runningPre ? 'prerelease' : '', CoreSourceText(up.core)].filter(Boolean).join(', ')})` : hasUpdater ? (runningPre ? ' (prerelease)' : '') : ' (cannot update itself)';
    const rows = [['Printer Bot', h('span', null, running || 'unknown', h('span', { class: 'muted' }, runningNote))]];
    if (up) rows.push(['Updater', h('span', null, String(up.loader.api), h('span', { class: 'muted' }, ` (revision ${up.loader.rev})`))]);
    const kids = [];
    for (const [label, value] of rows) kids.push(h('dt', null, label), h('dd', null, value));
    $('update-grid').replaceChildren(...kids);

    // a re-import: an action without an updater, an updater that is too old for the offered update, or a newer updater that exists
    let intro = '', reasonNotes = '', calm = false;
    if (!hasUpdater) intro = `This Printer Bot (${running || 'an old version'}) cannot update itself. Printer Bot ${LOADER_SINCE} can. Import it once. Your settings stay. From then on updates come from here.`;
    else if (up && state === 'reimport') { intro = 'This update needs a newer updater. Import Printer Bot once. Your settings stay.'; reasonNotes = (up.update.reimport && up.update.reimport.notes) || up.update.notes; }
    else if (up && up.update.reimport) { intro = 'A newer updater needs a one-time re-import. Your settings stay.'; reasonNotes = up.update.reimport.notes; calm = true; }
    $('update-reimport').hidden = !intro;
    $('update-reimport').classList.toggle('note', !calm);
    $('update-reimport-text').textContent = intro;
    $('update-reimport-notes').textContent = reasonNotes;
    $('update-reimport-notes').hidden = !reasonNotes;

    $('update-main').hidden = !hasUpdater;
    if (!hasUpdater) { $('update-badge').hidden = true; SetUpdatesHint('needs a re-import'); return; }
    RenderPrerelease(s, up, hostedOff);

    // the state line
    const u = up ? up.update : null;
    const target = u && u.latest ? u.latest : 'the update';
    // A newer version that the updater does not offer for installing (can.update is false) and that is on its list of rejected versions was set aside
    // after it failed to start on this PC. A version the person went back from is on that list too, and the updater still lets them install it.
    // An updater of revision 2 sets nothing aside for good (its list holds only versions the person went back from), so the sentence "will not be tried again" is for revision 1 only.
    const setAside = !retry && !!u && offered !== '' && !up.can.update && u.rejected.includes(offered);
    // The button is there only when the updater says it can install the offer (can.update). A version that an updater of revision 1 set aside gets no button.
    const showUpdate = !hostedOff && (state === 'available' || state === 'failed') && offered !== '' && !!up && up.can.update;
    // An updater of revision 2 marks a version that crashed or failed to start on this PC (update.failedBefore) and still offers it. The button then reads
    // "Try <version> again" and asks for a fresh download.
    const again = showUpdate && TryAgainOffered();
    // brief is the short form of the state for the summary line of the closed card
    let text = 'Waiting for the updater\u2026', brief = 'Waiting for the updater', level = '', message = '', notes = false, progress = -1;
    if (u) switch (state) {
        case 'idle': text = 'Checking soon.'; brief = 'Checking soon'; break;
        case 'checking': text = 'Checking for updates\u2026'; brief = 'Checking'; level = 'info'; break;
        case 'current':
            if (u.error === 'rejected' && offered) { text = `Update ${offered} was set aside.`; brief = `Update ${offered} set aside`; level = 'warn'; }
            else { text = 'Up to date.'; brief = 'Up to date'; level = 'ok'; }
            break;
        case 'available':
            if (offered) { text = `Update available: ${offered}${PreText(offered)}`; brief = again ? `Try ${offered} again` : `${IsPrereleaseVersion(offered) ? 'Prerelease' : 'Update'} ${offered} available`; level = again ? 'warn' : 'info'; notes = true; }
            else { text = 'Up to date.'; brief = 'Up to date'; level = 'ok'; }
            break;
        case 'downloading': text = `Downloading ${target}\u2026${u.progress > 0 ? ' ' + u.progress + '%' : ''}`; brief = 'Updating'; level = 'info'; notes = true; progress = u.progress; break;
        case 'verifying': text = `Checking the download of ${target}\u2026`; brief = 'Updating'; level = 'info'; notes = true; break;
        case 'waiting': text = 'Waiting for a receipt to finish\u2026'; brief = 'Updating'; level = 'warn'; notes = true; break;
        case 'installing': text = SwitchingText(u.latest); brief = 'Updating'; level = 'info'; notes = true; break;
        case 'installed': text = `Updated to ${up.core.version || target}.`; brief = LoadedAfterInstall(up) ? 'Up to date' : UPDATED_BRIEF; level = 'ok'; notes = true; break;
        case 'failed':
            if (droppedFrom) { text = 'Printer Bot went back to the built-in version.'; brief = 'went back to the built-in version'; level = 'warn'; message = retry ? `Version ${droppedFrom} stopped working, so Printer Bot paused it.` : `Version ${droppedFrom} stopped working, so Printer Bot set it aside.`; }
            else { text = 'The update did not work.'; brief = 'did not work'; level = 'bad'; message = UpdateErrorText(u.error) + FailedTail(u, up.core, running) + (setAside ? ` Version ${offered} will not be tried again.` : ''); notes = !!offered; }
            break;
        case 'paused': text = 'The author has paused updates.'; brief = 'paused'; level = 'warn'; break;
        case 'unavailable':
            // The updater records "off" when it asked while Download updates was off. Once the person has switched it on again, that line is out of date until the next message.
            if (u.error === 'off' && !hostedOff) { text = 'Checking soon.'; brief = 'Checking soon'; break; }
            text = 'Updates are not available.'; brief = 'not available'; level = 'warn'; message = UpdateErrorText(u.error); break;
        case 'reimport': text = 'This Printer Bot needs a one-time re-import to update.'; brief = 'needs a re-import'; level = 'warn'; break;
        default: text = 'The update state is not known.'; brief = ''; break;
    }
    // A refused command (an Update 60 seconds after a failure, for example) leaves the state as it is and sets an error. The reason shows in every state
    // that does not explain itself. The paused state and the re-import block say it already.
    // The error "off" is the one case that says nothing once Download updates is on again, and the card says "switched off" itself while it is off.
    if (u && u.error && u.error !== 'off' && !message && state !== 'paused' && state !== 'reimport') message = UpdateErrorText(u.error);
    // An offer that crashed or failed to start before says why it is paused, and what the button does. A reason the updater gave stays in front.
    if (!message && state === 'available' && again) message = FailedBeforeText(offered);
    if (hostedOff && !working) { text = 'Updates are switched off. Turn on "Download updates" below.'; brief = 'switched off'; level = 'warn'; message = ''; notes = false; }
    SetUpdatesHint(brief);
    $('update-dot').className = 'dot' + (level ? ' ' + level : '');
    $('update-state-text').textContent = text;
    $('update-progress').hidden = progress < 0;
    if (progress >= 0) $('update-progress').value = progress;
    $('update-message').textContent = message;
    $('update-message').hidden = !message;
    $('update-message').classList.toggle('error', state === 'failed' && !droppedFrom);
    const notesText = u && notes ? u.notes : '';
    $('update-notes-text').textContent = notesText;
    $('update-notes').hidden = !notesText;
    $('update-checked').textContent = u ? AgeText(u.checked) : 'not yet';

    // the buttons
    const check = $('core-check-button');
    check.disabled = !up || !up.can.check || state === 'checking' || working || hostedOff || checkingCore;
    check.textContent = checkingCore || state === 'checking' ? 'Checking\u2026' : 'Check now';
    check.title = hostedOff ? HOSTED_OFF_TEXT : up && !up.can.check ? 'The updater cannot check right now.' : '';

    if (updateArmed && (!showUpdate || updateArmedFor !== OfferKey(offered, again))) ResetUpdateArm();       // what was on screen when the first click came is gone
    const button = $('core-update-button');
    button.hidden = !showUpdate;
    button.disabled = updateSending || reinstallSending;
    button.title = '';
    button.textContent = !showUpdate ? 'Update' : updateSending ? 'Starting\u2026' : updateArmed ? (again ? 'Try again now? Click again' : 'Update now? Click again') : again ? `Try ${offered} again` : `Update to ${offered}${PreText(offered)}`;
    button.classList.toggle('confirming', updateArmed);
    $('update-hint').hidden = !showUpdate;
    // The updater turned a click down because it tried an update a moment ago. This is a note under the button and leaves the reason of the failure alone.
    $('update-refused').textContent = showUpdate && u.refused === 'wait' ? REFUSED_WAIT_TEXT : '';
    $('update-refused').hidden = !$('update-refused').textContent;
    $('core-reload-button').hidden = state !== 'installed' || LoadedAfterInstall(up);       // the program is new: the dock reloads, unless this page loaded after the install
    RenderUpdateNotice(state, up);                                                          // 3.2.0-beta.6: the same, and a restart that is needed, at the very top
    $('update-badge').hidden = !(state === 'available' && showUpdate);

    // The line is for an automatic install that is under way or has just finished. A failure and a new offer never carry it.
    let autoText = '';
    if (u && u.auto && (working || state === 'installed')) autoText = working ? 'Installing automatically.' : (TimeText(u.autoInstalled) ? `Installed automatically at ${TimeText(u.autoInstalled)}.` : 'Installed automatically.');
    $('update-auto-info').textContent = autoText;
    $('update-auto-info').hidden = !autoText;

    const rollbackOk = !!up && up.can.rollback && !working && state !== 'checking' && !rollbackPause;
    $('core-rollback-button').disabled = !rollbackOk;
    $('core-rollback-button').title = up && !up.can.rollback ? 'There is no previous version to go back to.' : '';
    $('core-builtin-button').disabled = !rollbackOk || up.core.source !== 'downloaded';
    $('core-builtin-button').title = up && up.core.source !== 'downloaded' ? 'Printer Bot already runs the built-in version.' : '';

    // Reinstall downloads the program again over the stored copy. Only an updater of revision 2 or later can, so the row is there only for such an updater,
    // and the button is on when the updater says it can (can.reinstall).
    const reinstallFor = ReinstallVersion();
    $('update-reinstall-row').hidden = !retry;
    if (reinstallArmed && (reinstallFor === '' || reinstallArmedFor !== reinstallFor)) ResetReinstallArm();
    const reinstall = $('core-reinstall-button');
    reinstall.disabled = reinstallFor === '' || updateSending || reinstallSending;
    reinstall.textContent = reinstallSending ? 'Starting\u2026' : reinstallArmed ? 'Reinstall now? Click again' : reinstallFor ? `Reinstall ${reinstallFor}` : 'Reinstall';
    reinstall.classList.toggle('confirming', reinstallArmed);
    reinstall.title = reinstallFor ? '' : hostedOff ? HOSTED_OFF_TEXT : working || state === 'checking' ? 'An update is under way.' : REINSTALL_OFF_TEXT;
}

function CheckCore() {
    if (!pbUpdater || !pbUpdater.can.check || checkingCore) return;
    checkingCore = true;
    setTimeout(() => { checkingCore = false; RenderUpdates(); }, PAUSE_MS);
    Send('checkCore');
    RenderUpdates();
}

// Installing takes two clicks: the first arms the button, and a second click within 5 s sends the command with the version that was on screen.
// If the offer changes between the clicks, the button disarms and nothing is sent.
// A version that crashed or failed to start here before (update.failedBefore, from an updater of revision 2) is tried again with a fresh download: force.
function UpdateCore() {
    const offered = OfferedVersion();
    if (!pbUpdater || !pbUpdater.can.update || !offered || updateSending || reinstallSending || HostedUpdatesOff(pbStatus)) return;
    if (!['available', 'failed'].includes(pbUpdater.update.state)) return;
    const again = TryAgainOffered();
    if (!updateArmed || updateArmedFor !== OfferKey(offered, again)) {
        ResetUpdateArm();
        ResetReinstallArm();                // one thing at a time is armed
        updateArmed = true;
        updateArmedFor = OfferKey(offered, again);
        updateArmTimer = setTimeout(() => { ResetUpdateArm(); RenderUpdates(); }, ARM_MS);
        RenderUpdates();
        return;
    }
    ResetUpdateArm();
    updateSending = true;
    rollbackAskedAt = 0;                    // an update the person starts is not the rollback they asked for earlier
    setTimeout(() => { updateSending = false; RenderUpdates(); }, PAUSE_MS * 2);
    Send('updateCore', again ? { expect: offered, force: true } : { expect: offered });
    RenderUpdates();
}

// Reinstalling takes two clicks as well. It sends updateCore for update.latest with force: the updater removes the stored copy, downloads the program
// again, checks it and starts it. The updater says when that is possible (can.reinstall).
function ReinstallCore() {
    const version = ReinstallVersion();
    if (!version || updateSending || reinstallSending) return;
    if (!reinstallArmed || reinstallArmedFor !== version) {
        ResetReinstallArm();
        ResetUpdateArm();                   // one thing at a time is armed
        reinstallArmed = true;
        reinstallArmedFor = version;
        reinstallArmTimer = setTimeout(() => { ResetReinstallArm(); RenderUpdates(); }, ARM_MS);
        RenderUpdates();
        return;
    }
    ResetReinstallArm();
    reinstallSending = true;
    rollbackAskedAt = 0;
    setTimeout(() => { reinstallSending = false; RenderUpdates(); }, PAUSE_MS * 2);
    Send('updateCore', { expect: version, force: true });
    RenderUpdates();
}

// to is 'previous' or 'builtin'. The buttons say what happens, so there is no second click.
function RollBack(to) {
    if (!pbUpdater || !pbUpdater.can.rollback || rollbackPause) return;
    rollbackPause = true;
    rollbackAskedAt = Date.now();
    rollbackWorking = false;
    rollbackFromKey = CoreKey(pbUpdater.core);
    setTimeout(() => { rollbackPause = false; RenderUpdates(); }, PAUSE_MS);
    Send('rollbackCore', { to });
    RenderUpdates();
}

// Reloads the router around this page, which picks the dock page for the version that runs now. Without a router it reloads this page.
function ReloadDock() {
    try { if (window.parent !== window) { window.parent.location.reload(); return; } } catch (e) { }
    window.location.reload();
}

// The time of the last check moves on by itself
setInterval(() => { if (pbUpdater && pbStatus && !$('update-main').hidden) $('update-checked').textContent = AgeText(pbUpdater.update.checked); }, 15000);


//////////////
// SETTINGS //
//////////////

const SETTING_CONTROLS = ['printer', 'paperWidthMm', 'mode', 'printProfile', 'paperTray', 'letterLayout', 'letterImageFit', 'dither', 'cut', 'feedDots', 'highRollerBits', 'allowHighRoller', 'allowImages', 'allowYouTubeHighRoller', 'uncutHypeTrain', 'highRollerBitsPerInch', 'highRollerMaxInches',
    'youtubeHighRollerAmount', 'youtubeHighRollerAmountPerInch', 'localCurrency', 'vcConnection', 'vcAddress', 'vcTapeMm', 'vcQuality', 'vcCut',
    'ignoreTestTriggers', 'keepDebugFiles', 'allowHostedUpdates', 'freePrintsPerMinute', 'printersPerBrowser', 'hideLinks', 'hypeTrain', 'hypeEndWaitSeconds', 'autoUpdateCore', 'prereleaseUpdates'];

const MAX_INCHES_LIMIT = 40;               // the action clamps the maximum length to this many inches

SETTING_CONTROLS.forEach(id => {
    const el = $(id);
    el.addEventListener('change', () => {
        let value = el.type === 'checkbox' ? el.checked : el.value;
        if (id === 'paperWidthMm') {
            // The paper select holds 80 mm, 58 mm and Letter. Letter is the setting paperSize alone (the width of the roll is kept for when the paper goes back to a roll), and a roll is
            // its width and paperSize roll.
            if (value === 'letter' || value === '4x6') {                         // 3.2.0-beta.2: the card of 4 x 6 in is a page as Letter is
                pendingSettings.paperSize = value;
                saveFailedNote = '';
                clearTimeout(saveTimer);
                saveTimer = setTimeout(SaveSettings, 400);
                RtRenderPaper1();
                return;
            }
            if (PaperSizeNow() === 'letter' || PaperSizeNow() === '4x6') pendingSettings.paperSize = 'roll';          // a printer that is on Letter goes back to a roll of this width. A roll stays a roll with no word about it
        }
        if (id === 'letterLayout') value = RtLayoutOf(value);                // never sent as anything but scaled or message
        if (id === 'letterImageFit') value = RtFitOf(value);                 // never sent as anything but fill, fit or stretch
        if (id === 'paperTray') value = RtTrayClean(value);                  // 3.2.0-beta.3: a tray of the driver by its name, cleaned as the action keeps it ('' = the driver's default)
        if (id === 'vcTapeMm') value = RtVcTapeOf(value);                    // 3.2.0: 0 (the printer's) or one of the five tapes
        if (id === 'vcAddress') { value = RtVcAddressClean(value); el.value = value; }      // trimmed, no spaces: the action refuses any other shape and clears it
        if (id === 'vcConnection' || id === 'vcAddress') RtRenderPaper1();   // the address row comes and goes with the connection, the printer list with Wi-Fi
        if (id === 'paperWidthMm' || id === 'feedDots' || id === 'highRollerBits') value = parseInt(value, 10) || 0;
        if (id === 'feedDots' || id === 'highRollerBits') {
            if (value < 0) value = 0;                                         // blank / junk / negative = 0
            const maximum = id === 'feedDots' ? 400 : 1000000;
            if (value > maximum) value = maximum;                             // the action clamps the same way
            el.value = value;                                                 // show what will actually be saved
        }
        if (id === 'hypeEndWaitSeconds') {
            // The Hype Train end wait is refused like Printers per browser: below 90, above 300, negative, a fraction, an exponent, text and nothing are all blocked with a message, and nothing is saved
            const n = hypeWaitBox.of(el.value);
            if (n === null) {
                const kept = hypeWaitBox.kept();
                hypeWaitBox.setError(hypeWaitBox.message());
                if (kept !== null) el.value = kept;
                return;
            }
            hypeWaitBox.setError('');
            value = n;
            el.value = n;
        }
        if (id === 'printersPerBrowser') {
            // Printers per browser is the one number here that is never "fixed" for the person: 0, a negative number, a fraction, text or nothing is refused with a message, and nothing is saved
            const n = PerBrowserOf(el.value);
            if (n === null) {
                const kept = PerBrowserKept();
                SetPerBrowserError(PerBrowserMessage());
                if (kept !== null) el.value = kept;                           // the box goes back to the number that is in use, the message stays
                RenderPerBrowser(pbStatus);
                return;
            }
            SetPerBrowserError('');
            value = n;
            el.value = n;
        }
        if (id === 'freePrintsPerMinute') {
            value = parseInt(value, 10);
            if (!(value > 0)) value = 0;                                      // blank / junk / negative = no limit
            if (value > 100000) value = 100000;                               // the action clamps the same way
            el.value = value;
        }
        if (id === 'highRollerBitsPerInch') {
            value = parseFloat(value);
            if (!(value > 0 && isFinite(value))) value = 0;                  // blank / junk / negative = no limit
            if (value > 1000000) value = 1000000;                             // the action clamps the same way
            el.value = value;                                                 // show what will actually be saved
            RenderBitsPerInchExample();
        }
        if (id === 'highRollerMaxInches') {
            value = parseFloat(value);
            if (!(value > 0 && isFinite(value))) value = 0;                  // blank / junk / negative = the built-in limit
            if (value > MAX_INCHES_LIMIT) value = MAX_INCHES_LIMIT;           // the action clamps the same way
            el.value = value;
            RenderBitsPerInchExample();
        }
        if (id === 'youtubeHighRollerAmount' || id === 'youtubeHighRollerAmountPerInch') {
            // 3.0.2: a negative number, a number above 1,000,000,000 and anything that is no number are refused with a message, the amount in use comes back into the box and nothing
            // is sent. A number with more digits after the point is rounded to two, as the action rounds it, and the box shows what is sent. An empty box is 0.
            const n = AmountOf(el.value, AmountBadInput(el));
            if (n === null) {
                const kept = AmountKept(id);
                SetAmountError(id, AmountMessage(id));
                if (kept !== null) el.value = kept;
                RenderYouTubeExample();
                RtRenderYouTube();
                return;
            }
            SetAmountError(id, '');
            value = n;
            el.value = n;
        }
        if (id === 'localCurrency' && !CurrencyListed(value)) {              // only a currency that the action lists is ever sent (the list holds nothing else, so this is a guard)
            el.value = CurrencyShown();
            return;
        }
        pendingSettings[id] = value;
        saveFailedNote = '';                                                 // an edit starts a new try
        if (id === 'youtubeHighRollerAmount' || id === 'youtubeHighRollerAmountPerInch' || id === 'localCurrency') {
            RenderYouTubeExample();                                          // the example and the line of the exchange name the amount and the currency as they are now
            RenderExchange(pbStatus);
            RtRenderYouTube();
        }
        if (id === 'hypeTrain') RenderAdvancedHint();
        if (id === 'letterLayout') RtRenderPaper1();                         // the row Image fit comes and goes with the choice at once, before the choice is saved
        // keep the visible rows in step right away. The confirmed values come back with the next status
        if (id === 'mode') {
            $('mode-description').textContent = modeText(value);
            if (value === 'escpos' && ($('paperWidthMm').value === 'letter' || $('paperWidthMm').value === '4x6')) {            // a page is not for a thermal printer: it goes back to the roll it had
                pendingSettings.paperSize = 'roll';
                $('paperWidthMm').value = RollWidthShown();
            }
            ApplyModeVisibility(value);
            PrintersUpdateMore();
        }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(SaveSettings, 400);
    });
});

// ---- Images in messages (3.0.0-beta.9)
// One box for each site in status.imageSites.available. The setting is the whole list of the ids that are on (settings.imageSites), and a save replaces it as a whole. The page
// changes the ids it shows and keeps every other id of the list (a site that a newer Printer Bot knew), so a click never loses one. A newly switched on site goes to the end of the list.
// The boxes are made again only when the list of sites changed, and not while one of them has the keyboard focus. Their state always comes from ImageSitesNow, so a status that is older
// than the person's click cannot undo the click, and the Saved, not saved yet and waiting marks follow the same pending, in-flight and confirmed steps as every other setting.
let imageSitesSignature = '', imageSavedMark = false;
const IMAGE_SITE_HINT = 'direct picture links only';
const SETTING_OLDER_TEXT = 'The Printer Bot action is older than this dock. Import it again to use this setting.';

// The ids that are on, as the page knows them now: an edit on its way, a save that is not confirmed yet, or what the action reports
function ImageSitesNow() {
    let list = null;
    if (hasOwn(pendingSettings, 'imageSites')) list = pendingSettings.imageSites;
    else if (hasOwn(inFlight, 'imageSites')) list = inFlight.imageSites.value;
    else if (pbStatus) list = pbStatus.settings.imageSites;
    return Array.isArray(list) ? list.filter(id => typeof id === 'string') : [];
}

function RenderImageSites(s) {
    const info = s ? s.imageSites : null;
    const list = $('image-sites-list');
    const shown = !!info && info.available.length > 0;
    $('image-sites-row').hidden = !shown;
    if (!shown) {
        if (imageSitesSignature !== '') { imageSitesSignature = ''; list.replaceChildren(); }
        RtRenderImages();
        return;
    }
    const signature = JSON.stringify(info.available);
    if (signature !== imageSitesSignature && !list.contains(document.activeElement)) {
        imageSitesSignature = signature;
        list.replaceChildren(...info.available.map((site, i) => {
            const box = h('input', { type: 'checkbox', id: `image-site-${i}`, 'data-site': site.id, 'aria-describedby': `image-site-hint-${i}` });
            box.addEventListener('change', () => ToggleImageSite(site.id, box.checked));
            return h('div', { class: 'image-site' }, box, h('label', { for: `image-site-${i}` }, site.name), h('span', { class: 'image-site-hint', id: `image-site-hint-${i}` }, IMAGE_SITE_HINT));
        }));
    }
    const supported = Array.isArray(s.settings.imageSites);          // an action that does not report the setting would ignore it: the boxes are off, with the reason
    const on = ImageSitesNow();
    let anyOn = false;
    list.querySelectorAll('input[data-site]').forEach(box => {
        box.checked = on.includes(box.getAttribute('data-site'));
        if (box.checked) anyOn = true;
        box.disabled = !supported;
        if (supported) box.removeAttribute('title'); else box.title = SETTING_OLDER_TEXT;
    });
    $('image-sites-none').hidden = anyOn;
    RenderImageSitesUnsaved();
    RtRenderImages();                                                 // the switch Allow images of every printer shows while a site is on (printers.js)
}

// The line in the group while the edit waits for a connection (the same words as the line under the heading of Settings)
function RenderImageSitesUnsaved() {
    $('image-sites-unsaved').hidden = !(unsavedWaiting && hasOwn(pendingSettings, 'imageSites'));
}

function ToggleImageSite(id, on) {
    let next = ImageSitesNow();
    if (on) { if (!next.includes(id)) next.push(id); }
    else next = next.filter(x => x !== id);
    pendingSettings.imageSites = next;
    saveFailedNote = '';                                                 // an edit starts a new try
    RenderImageSites(pbStatus);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(SaveSettings, 400);
}

// A box that kept the focus while the list of sites changed is made again when the focus has left
$('image-sites-list').addEventListener('focusout', () => setTimeout(() => { if (pbStatus) RenderImageSites(pbStatus); }, 0));

// ---- A number box that takes a whole number between two limits and nothing else (3.0.0-beta.4)
// Digits only, at most three of them, and the number has to lie between min and max. A blank box, 0, a negative number, a fraction, an exponent, a sign, a letter or a symbol is refused.
// The keys that make a sign, a fraction or an exponent do nothing and say why, a wrong number shows the message as it is typed, and when the box is left the number that is in use
// (an edit on its way, a save that is not confirmed yet, or what the action reports) comes back. Nothing wrong is ever sent. The action checks the number again.
function StrictIntegerBox(cfg) {
    let error = '';
    const input = () => $(cfg.id);
    const box = {
        of(text) {
            const t = String(text == null ? '' : text).trim();
            if (!/^[0-9]{1,3}$/.test(t)) return null;
            const n = parseInt(t, 10);
            return n >= cfg.min && n <= cfg.max ? n : null;
        },
        kept() {
            let v;
            if (hasOwn(pendingSettings, cfg.id)) v = pendingSettings[cfg.id];
            else if (hasOwn(inFlight, cfg.id)) v = inFlight[cfg.id].value;
            else if (pbStatus && pbStatus.settings) v = pbStatus.settings[cfg.id];
            return Number.isInteger(v) && v >= cfg.min && v <= cfg.max ? v : null;
        },
        message() {
            const kept = box.kept();
            return `Enter a whole number of ${cfg.unit} from ${cfg.min} to ${cfg.max}.` + (kept === null ? '' : ` ${cfg.noun} stays at ${kept} ${cfg.unit}.`);
        },
        setError(text) {
            error = text;
            const out = $(cfg.errorId);
            out.textContent = text;
            out.hidden = !text;
            if (text) input().setAttribute('aria-invalid', 'true'); else input().removeAttribute('aria-invalid');
        },
        error() { return error; },
    };
    input().addEventListener('keydown', (ev) => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        if (['e', 'E', '+', '-', '.', ','].includes(ev.key)) { ev.preventDefault(); box.setError(box.message()); }
    });
    input().addEventListener('input', () => { box.setError(box.of(input().value) === null ? box.message() : ''); });
    return box;
}

const hypeWaitBox = StrictIntegerBox({ id: 'hypeEndWaitSeconds', errorId: 'hype-wait-error', min: 90, max: 300, unit: 'seconds', noun: 'The Hype Train end wait' });

// ---- YouTube High Roller (3.0.2)
// The amount and the amount per inch are money in the streamer's own currency (localCurrency): a number from 0 to 1,000,000,000, kept with two digits after the point. The action refuses
// a negative number, a number above that and anything that is no number (status.saveNote says why), and rounds to two digits, half away from zero, in decimal. The page sends none of
// the values the action refuses: the keys of a minus sign, an exponent and a comma do nothing and say why, a value that is not allowed shows the message under the box as it is typed,
// and when the box is left with such a value the amount in use comes back into the box and nothing is sent. A number with more digits after the point is rounded the way the action
// rounds it. An empty box is 0 (the amount: never; the amount per inch: no limit of its own), like the other number boxes of Advanced.
const YOUTUBE_AMOUNT_MAX = 1000000000;
const AMOUNT_TEXT = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const AMOUNT_BOXES = {
    youtubeHighRollerAmount: { errorId: 'youtube-amount-error', noun: 'The YouTube High Roller threshold' },
    youtubeHighRollerAmountPerInch: { errorId: 'youtube-per-inch-error', noun: 'YouTube High Roller: amount per inch' },
};

// A number box that holds text it cannot read (the browser then reports an empty value)
const AmountBadInput = (el) => !!(el && el.validity && el.validity.badInput);

// n (a finite number from 0 to the most) with two digits after the point, rounded half away from zero as the action rounds it: in decimal, from the 15 digits that a decimal of .NET
// takes from a double (so 5.005 is 5.01, where the double 5.00499... would round down)
function RoundAmount(n) {
    if (!(n >= 0.000001)) return 0;
    const parts = n.toPrecision(15).split('.');
    const frac = ((parts[1] || '') + '000').slice(0, 3);
    let cents = Number(parts[0]) * 100 + Number(frac.slice(0, 2));
    if (frac.charAt(2) >= '5') cents += 1;
    return cents / 100;
}

// The text of a box as the amount the page would send, or null when it may not be sent
function AmountOf(text, badInput) {
    if (badInput) return null;
    const t = String(text == null ? '' : text).trim();
    if (t === '') return 0;
    if (!AMOUNT_TEXT.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 && n <= YOUTUBE_AMOUNT_MAX ? RoundAmount(n) : null;
}

// The amount that is in use: an edit on its way, a save that is not confirmed yet, or what the action reports. Null when none is known.
function AmountKept(id) {
    let v;
    if (hasOwn(pendingSettings, id)) v = pendingSettings[id];
    else if (hasOwn(inFlight, id)) v = inFlight[id].value;
    else if (pbStatus && pbStatus.settings) v = pbStatus.settings[id];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= YOUTUBE_AMOUNT_MAX ? v : null;
}

// The amount as the page shows it now: the number typed in the box when the page would send it, else the amount in use (0 when none is known)
function YouTubeAmountShown(id) {
    const el = $(id);
    const typed = AmountOf(el.value, AmountBadInput(el));
    if (typed !== null) return typed;
    const kept = AmountKept(id);
    return kept === null ? 0 : kept;
}

const AmountText = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function AmountMessage(id) {
    const kept = AmountKept(id);
    return 'Enter a number from 0 to 1,000,000,000, with no minus sign.' + (kept === null ? '' : ` ${AMOUNT_BOXES[id].noun} stays at ${AmountText(kept)}.`);
}

function SetAmountError(id, text) {
    const out = $(AMOUNT_BOXES[id].errorId);
    out.textContent = text;
    out.hidden = !text;
    if (text) $(id).setAttribute('aria-invalid', 'true'); else $(id).removeAttribute('aria-invalid');
}

for (const id of Object.keys(AMOUNT_BOXES)) {
    const el = $(id);
    el.addEventListener('keydown', (ev) => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        if (['e', 'E', '+', '-', ','].includes(ev.key)) { ev.preventDefault(); SetAmountError(id, AmountMessage(id)); }
    });
    el.addEventListener('input', () => {
        SetAmountError(id, AmountOf(el.value, AmountBadInput(el)) === null ? AmountMessage(id) : '');
        RenderYouTubeExample();
    });
}

// YouTube currency: the currencies of status.exchange.currencies, each as its code and its name, the value being the code. A currency the action reports and does not list (an action that
// sends no list) is shown as its code alone, so the box never shows a currency that is not in use. The list is made again only when it changed, and not while it has the focus.
let currencySignature = '';

const CurrencyListed = (code) => !!pbStatus && !!pbStatus.exchange && typeof code === 'string' && pbStatus.exchange.currencies.some(c => c.code === code);

// The currency as the page shows it now (the choice in the box, an edit included), else the one the action reports
function CurrencyShown() {
    const v = $('localCurrency').value;
    if (CURRENCY_CODE.test(v)) return v;
    const st = pbStatus ? pbStatus.settings : null;
    if (st && typeof st.localCurrency === 'string' && CURRENCY_CODE.test(st.localCurrency)) return st.localCurrency;
    return pbStatus && pbStatus.exchange && pbStatus.exchange.local ? pbStatus.exchange.local : '';
}

function RenderCurrencies(s) {
    const select = $('localCurrency');
    const st = s.settings;
    const saved = typeof st.localCurrency === 'string' && CURRENCY_CODE.test(st.localCurrency) ? st.localCurrency : '';
    const items = (s.exchange ? s.exchange.currencies : []).map(c => [c.code, c.name ? `${c.code} (${c.name})` : c.code]);
    if (saved && !items.some(i => i[0] === saved)) items.unshift([saved, saved]);
    const busy = select === document.activeElement || Protected('localCurrency');
    const signature = JSON.stringify(items);
    if (signature !== currencySignature && select !== document.activeElement) {
        const chosen = select.value;
        currencySignature = signature;
        select.replaceChildren(...items.map(i => new Option(i[1], i[0])));
        select.value = Protected('localCurrency') && items.some(i => i[0] === chosen) ? chosen : saved;
    }
    else if (!busy && saved && select.value !== saved) select.value = saved;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2026-09-30" -> "30 September 2026", or '' for anything else
function DateInWords(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof text === 'string' ? text : '');
    if (!m) return '';
    const month = parseInt(m[2], 10), day = parseInt(m[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${day} ${MONTH_NAMES[month - 1]} ${m[1]}`;
}

// The small line under YouTube currency: where the exchange rates stand. Hidden for an action that does not say (no status.exchange) or says something the page does not know.
function RenderExchange(s) {
    const line = $('exchange-state');
    const x = s ? s.exchange : null;
    let text = '', warn = false;
    if (x && x.state === 'off') text = 'Exchange rates are loaded only while the YouTube High Roller threshold is above 0 and a printer allows YouTube High Roller prints or uses Large message on Letter paper.';
    else if (x && x.state === 'checking') text = 'Loading exchange rates from the U.S. Treasury...';
    else if (x && x.state === 'ok') {
        const when = DateInWords(x.date);
        text = 'Super Chats in other currencies are converted with the U.S. Treasury exchange rates' + (when ? ` of ${when}.` : '.');
    }
    else if (x && x.state === 'offline') {
        text = `Currency exchange is offline right now, so only Super Chats in ${CurrencyShown() || 'your YouTube currency'} can print as YouTube High Roller messages. Printer Bot tries again by itself.`;
        warn = true;
    }
    line.textContent = text;
    line.hidden = !text;
    line.classList.toggle('warn', warn);
}

// What the amount per inch means, in the person's own numbers: the YouTube High Roller threshold and four times it, in their YouTube currency
function RenderYouTubeExample() {
    const line = $('youtube-per-inch-example');
    if (!pbStatus || !hasOwn(pbStatus.settings, 'youtubeHighRollerAmountPerInch')) { line.textContent = ''; return; }
    const perInch = YouTubeAmountShown('youtubeHighRollerAmountPerInch');
    const amount = YouTubeAmountShown('youtubeHighRollerAmount');
    const currency = CurrencyShown();
    const cap = MaxInchesSetting();
    const NB = '\u00A0';                                                       // keeps "4 inches" and "5.00 USD" from splitting across lines
    const money = (n) => AmountText(n) + (currency ? NB + currency : '');
    const round = (v, places) => Math.round(v * 10 ** places) / 10 ** places;
    const inchText = (v) => `${v}${NB}${v === 1 ? 'inch' : 'inches'}`;
    const limitInches = cap > 0 ? cap : MAX_MESSAGE_INCHES;
    const ceiling = inchText(round(limitInches, cap > 0 ? 2 : 1));
    const ceilingName = cap > 0 ? 'the maximum length you set' : 'the longest any message prints';
    // inches a Super Chat of n may print: null when that is past the ceiling
    const inches = (n) => { const v = n / perInch; return v > limitInches ? null : v < 0.01 ? `less than 0.01${NB}inches` : inchText(round(v, 2)); };
    let text;
    if (!(perInch > 0) && !(cap > 0)) text = 'Off: YouTube High Roller messages print in full.';
    else if (!(amount > 0)) text = 'YouTube High Roller threshold (amount) is 0, so no Super Chat is a High Roller and this has no effect.';
    else if (!(perInch > 0)) text = `No amount per inch limit. A YouTube High Roller message prints up to ${ceiling}, then fades out.`;
    else {
        const low = amount, high = round(amount * 4, 2);
        if (inches(low) === null) text = `At ${money(perInch)} per inch, even a ${money(low)} Super Chat reaches ${ceiling}, ${ceilingName}.`;
        else text = `At ${money(perInch)} per inch, a ${money(low)} Super Chat gets up to ${inches(low)}, and a ${money(high)} one up to ` +
            (inches(high) === null ? `${ceiling} (${ceilingName}).` : `${inches(high)}.`);
    }
    line.textContent = text;
}

// ---- Printers per browser (3.0.0-beta.3)
const PER_BROWSER_MAX = 100;                // the action takes a whole number from 1 to 100 and refuses anything else (PbSettings.PerBrowserValid)
const PER_BROWSER_DEFAULT_MAX_BROWSERS = 16;
let perBrowserError = '';

// The text of the box as a number: a whole number from 1 to 100, else null. Blank, 0, negative, a fraction, an exponent and text are all null.
function PerBrowserOf(text) {
    const t = String(text == null ? '' : text).trim();
    if (!/^[0-9]{1,3}$/.test(t)) return null;
    const n = parseInt(t, 10);
    return n >= 1 && n <= PER_BROWSER_MAX ? n : null;
}

// The number that is in use: an edit on its way, a save that is not confirmed yet, or what the action reports. Null when none is known.
function PerBrowserKept() {
    let v;
    if (hasOwn(pendingSettings, 'printersPerBrowser')) v = pendingSettings.printersPerBrowser;
    else if (hasOwn(inFlight, 'printersPerBrowser')) v = inFlight.printersPerBrowser.value;
    else if (pbStatus && pbStatus.settings) v = pbStatus.settings.printersPerBrowser;
    return Number.isInteger(v) && v >= 1 && v <= PER_BROWSER_MAX ? v : null;
}

function PerBrowserMessage() {
    const kept = PerBrowserKept();
    return 'Enter a whole number from 1 to ' + PER_BROWSER_MAX + '.' + (kept === null ? '' : ' Printers per browser stays at ' + kept + '.');
}

function SetPerBrowserError(text) {
    perBrowserError = text;
    const box = $('per-browser-error'), input = $('printersPerBrowser');
    box.textContent = text;
    box.hidden = !text;
    if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
}

// The line under the description: what the number means for the printers there are now, and how many browsers run
function RenderPerBrowser(s) {
    const line = $('per-browser-example');
    if (!s || !s.settings || !hasOwn(s.settings, 'printersPerBrowser')) { line.textContent = ''; return; }
    const typed = PerBrowserOf($('printersPerBrowser').value);
    const per = typed !== null ? typed : PerBrowserKept();
    if (per === null) { line.textContent = ''; return; }
    const count = Math.max(1, s.printers.length);
    const most = s.browsers && s.browsers.max > 0 ? s.browsers.max : PER_BROWSER_DEFAULT_MAX_BROWSERS;
    const needed = Math.ceil(count / per);
    const wanted = Math.min(most, needed);
    let text = wanted === 1 ? `All ${count} printers use one browser.` : `${count} printers at ${per} per browser use ${wanted} browsers.`;
    if (needed > most) text += ` That is more than the ${most} browsers Printer Bot ever starts, so some browsers serve more printers.`;
    if (s.browsers && s.browsers.perBrowser === per && s.browsers.running < s.browsers.wanted) text += ` ${s.browsers.running} of ${s.browsers.wanted} running. The others start in the background.`;
    line.textContent = text;
}

// The entry is blocked as it is typed: the keys that make an exponent, a sign or a fraction do nothing and say why, and a value that is not allowed shows the message at once
$('printersPerBrowser').addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (['e', 'E', '+', '-', '.', ','].includes(ev.key)) { ev.preventDefault(); SetPerBrowserError(PerBrowserMessage()); }
});
$('printersPerBrowser').addEventListener('input', () => {
    SetPerBrowserError(PerBrowserOf($('printersPerBrowser').value) === null ? PerBrowserMessage() : '');
    RenderPerBrowser(pbStatus);
});

// "Advanced" is collapsed until opened, and remembers whether it was left open
const advancedBox = $('advanced');
advancedBox.open = store.get('pbAdvancedOpen') === '1';
advancedBox.addEventListener('toggle', () => store.set('pbAdvancedOpen', advancedBox.open ? '1' : '0'));

// The Updates card is a group like that. It is closed until opened and remembers whether it was left open. Nothing opens it by itself:
// the summary line shows what needs attention, and only a click opens the card (on its heading, on the dot in the header or on Show the steps).
const updatesBox = $('updates-box');
updatesBox.open = store.get('pbUpdatesOpen') === '1';
updatesBox.addEventListener('toggle', () => store.set('pbUpdatesOpen', updatesBox.open ? '1' : '0'));

// The Test card is a group like that too (the owner, 15 October 2026: the card had grown too large). It is closed until opened and remembers whether it was left open.
const testBox = $('test-box');
testBox.open = store.get('pbTestOpen') === '1';
testBox.addEventListener('toggle', () => store.set('pbTestOpen', testBox.open ? '1' : '0'));

// The maximum length in the box: a number of inches from 0.01 to 40, or 0 when the box is empty, junk or off (then the built-in limit applies)
function MaxInchesSetting() {
    const v = parseFloat($('highRollerMaxInches').value);
    return v > 0 && isFinite(v) ? Math.min(v, MAX_INCHES_LIMIT) : 0;
}

// What the bits-per-inch number means, in the user's own numbers (and the Twitch High Roller threshold they have set).
// A message never prints longer than its ceiling. That is the built-in 1600 px = 1600 / 96 = 16.7 inches, or the maximum length when one is set.
const MAX_MESSAGE_INCHES = 1600 / 96;
function RenderBitsPerInchExample() {
    const perInch = parseFloat($('highRollerBitsPerInch').value);
    const threshold = parseInt($('highRollerBits').value, 10) || 0;
    const cap = MaxInchesSetting();
    const round = (v, places) => Math.round(v * 10 ** places) / 10 ** places;
    const NB = '\u00A0';                                                      // keeps "2.5 in" and "100 bits" from splitting across lines
    const bits = (n) => `${n}${NB}${n === 1 ? 'bit' : 'bits'}`;
    const limitInches = cap > 0 ? cap : MAX_MESSAGE_INCHES;
    const ceiling = `${round(limitInches, cap > 0 ? 2 : 1)}${NB}in`;
    const ceilingName = cap > 0 ? 'the maximum length you set' : 'the longest any message prints';
    // inches a cheer of n bits may print: null when that is past the ceiling
    const inches = (n) => { const v = n / perInch; return v > limitInches ? null : v < 0.01 ? `<${NB}0.01${NB}in` : `${round(v, 2)}${NB}in`; };
    let text;
    if (!(perInch > 0) && !(cap > 0)) text = 'Off: Twitch High Roller messages print in full.';
    else if (threshold <= 0) text = 'Twitch High Roller threshold (bits) is 0, so no cheer is a High Roller and this has no effect.';
    else if (!(perInch > 0)) text = `No bits per inch limit. A Twitch High Roller message prints up to ${ceiling}, then fades out.`;
    else {
        const low = threshold, high = threshold * 4;
        if (inches(low) === null) text = `At ${bits(perInch)} per inch, even ${bits(low)} reaches ${ceiling}, ${ceilingName}.`;
        else text = `At ${bits(perInch)} per inch: ${bits(low)} \u2192 up to ${inches(low)}, ${bits(high)} \u2192 up to ` +
            (inches(high) === null ? `${ceiling} (${ceilingName}).` : `${inches(high)}.`);
    }
    $('bits-per-inch-example').textContent = text;
    RenderYouTubeExample();                                                   // 3.0.2: the maximum length is the ceiling of a YouTube High Roller message too
    RenderAdvancedHint();
}

// Visible while Advanced is collapsed: what needs attention in there
function RenderAdvancedHint() {
    const parts = [];
    const perInch = parseFloat($('highRollerBitsPerInch').value);
    const cap = MaxInchesSetting();
    if ($('highRollerBitsPerInch').disabled || $('highRollerMaxInches').disabled || !$('action-outdated').hidden) parts.push('update needed');
    else {
        if (perInch > 0) parts.push(`limit ${perInch} bits/in`);
        if (cap > 0) parts.push(`max ${cap} in`);
    }
    if (pbStatus && pbStatus.skippedFree > 0) parts.push(`${pbStatus.skippedFree} skipped`);
    if (pbStatus && !$('hypeTrain').disabled && !$('hypeTrain').checked) parts.push('Hype Trains off');
    // 3.0.3: the warning under the Twitch High Roller threshold sits in Advanced now, so a closed Advanced still says that no printer takes those cheers (printers.js, RtRenderHighRoller)
    if (!$('high-roller-warning').hidden) parts.push('Twitch High Roller off on every printer');
    $('advanced-hint').textContent = parts.length ? ' \u00B7 ' + parts.join(' \u00B7 ') : '';
}
$('highRollerBitsPerInch').addEventListener('input', RenderBitsPerInchExample);
$('highRollerMaxInches').addEventListener('input', RenderBitsPerInchExample);
$('highRollerBits').addEventListener('input', RenderBitsPerInchExample);

// The paper size of printer 1 as the page knows it now (an edit on its way, a save that is not confirmed yet, or what the action reports)
function PaperSizeNow() {
    if (hasOwn(pendingSettings, 'paperSize')) return pendingSettings.paperSize;
    if (hasOwn(inFlight, 'paperSize')) return inFlight.paperSize.value;
    return pbStatus && hasOwn(pbStatus.settings, 'paperSize') ? pbStatus.settings.paperSize : 'roll';
}

// The width of the roll of printer 1 as the page knows it now (an edit on its way, a save that is not confirmed yet, or what the action reports), as the value of the paper select
function RollWidthShown() {
    let w = 80;
    if (hasOwn(pendingSettings, 'paperWidthMm')) w = pendingSettings.paperWidthMm;
    else if (hasOwn(inFlight, 'paperWidthMm')) w = inFlight.paperWidthMm.value;
    else if (pbStatus && hasOwn(pbStatus.settings, 'paperWidthMm')) w = pbStatus.settings.paperWidthMm;
    return num(w) >= 70 ? '80' : '58';
}

// Sends the edits that wait. When the action cannot be reached they stay in pendingSettings and the first status of the next connection sends them.
// Resolves to true when the action took the save.
function SaveSettings() {
    clearTimeout(saveTimer);
    if (Object.keys(pendingSettings).length === 0) { RenderUnsaved(); return Promise.resolve(true); }
    if (!sbConnected || !actionId) { unsavedWaiting = true; RenderUnsaved(); return Promise.resolve(false); }
    const patch = pendingSettings;
    pendingSettings = {};
    const at = Date.now();
    const send = ++sendSeq;
    for (const id of Object.keys(patch)) { inFlight[id] = { value: patch[id], at }; awaitingSave[id] = { value: patch[id], at }; lastSendOf[id] = send; }
    unsavedWaiting = false;
    RenderUnsaved();
    if (windowTimer === null) windowTimer = setTimeout(WindowEnded, IN_FLIGHT_MS + 100);
    // The updater reads this setting when it checks. A change of the switch for prerelease versions is followed by a check, so the card shows the result.
    if (hasOwn(patch, 'prereleaseUpdates')) setTimeout(() => { if (pbUpdater && pbUpdater.can.check && !HostedUpdatesOff(pbStatus)) CheckCore(); }, 1500);
    const record = { patch, at, handled: false };
    outstandingSends.set(send, record);
    return Send('saveSettings', { settingsJson: JSON.stringify(patch) }).then(ok => {
        outstandingSends.delete(send);
        if (record.handled) return ok;                    // the connection was lost while it was on its way, and it was put back then
        if (ok) saveRetries = 0; else SaveFailed(send, patch, at);
        return ok;
    });
}

// A save that did not go out: its edits go back into pendingSettings, so the fields keep showing them and the next attempt sends them. A setting that the person changed
// again meanwhile keeps the newer value, and one that a newer send carries is left to that send. A save that failed after its window ended (nobody answered for four seconds)
// is not put back: the field has gone back to what the action reported by then.
function SaveFailed(send, patch, at) {
    const fresh = Date.now() - at <= IN_FLIGHT_MS;
    let restored = false;
    for (const id of Object.keys(patch)) {
        if (lastSendOf[id] !== send) continue;
        delete inFlight[id];
        delete awaitingSave[id];
        if (fresh && !hasOwn(pendingSettings, id)) { pendingSettings[id] = patch[id]; restored = true; }
    }
    if (!restored) return;
    unsavedWaiting = true;
    RenderUnsaved();
    if (sbConnected && statusSeen) ScheduleRetry();          // with the connection gone, the first status of the next connection sends them
}

// A failure with the connection up (the action refused the save, or did not answer): try again after a wait that grows, five times, then give up
function ScheduleRetry() {
    clearTimeout(saveRetryTimer);
    if (saveRetries >= RETRY_WAITS_MS.length) { GiveUpSaving(); return; }
    saveRetryTimer = setTimeout(FlushPending, RETRY_WAITS_MS[saveRetries++]);
}

function FlushPending() {
    clearTimeout(saveRetryTimer);
    if (Object.keys(pendingSettings).length === 0) { RenderUnsaved(); return; }
    if (!sbConnected || !statusSeen) return;                // not yet: the first status of the connection comes back here
    SaveSettings();
}

// Nothing got through: the edits are dropped and every field shows what the action reported, with a line that says so
function GiveUpSaving() {
    pendingSettings = {};
    saveRetries = 0;
    unsavedWaiting = false;
    saveFailedNote = SAVE_FAILED_TEXT;
    clearTimeout(saveFailedTimer);
    saveFailedTimer = setTimeout(() => { saveFailedNote = ''; RenderUnsaved(); }, 15000);
    RenderUnsaved();
    if (pbStatus) FillSettings(pbStatus);
    if (restoreSent) { clearTimeout(restoreSent.timer); restoreSent = null; BackupMessage('The settings could not be restored. Printer Bot did not take them.', 'error'); }
}

// The line under the heading of Settings: edits that wait for a connection, or the note that a save was given up
function RenderUnsaved() {
    const waiting = unsavedWaiting && Object.keys(pendingSettings).length > 0;
    const line = $('unsaved-line');
    line.hidden = !(waiting || saveFailedNote);
    line.textContent = waiting ? 'Not saved yet. Waiting for Streamer.bot.' : saveFailedNote;
    RenderImageSitesUnsaved();
}

// The window of a send ended without a status that confirms it: the field goes back to what the action reported last, and a new status is asked for
function WindowEnded() {
    windowTimer = null;
    const now = Date.now();
    let expired = false, next = 0;
    for (const id of Object.keys(inFlight)) {
        const left = inFlight[id].at + IN_FLIGHT_MS - now;
        if (left < 0) { delete inFlight[id]; expired = true; }
        else if (next === 0 || left < next) next = left;
    }
    for (const id of Object.keys(awaitingSave)) if (now - awaitingSave[id].at > IN_FLIGHT_MS) delete awaitingSave[id];
    if (next > 0) windowTimer = setTimeout(WindowEnded, next + 100);
    if (expired && pbStatus) {
        FillSettings(pbStatus);
        if (sbConnected && statusSeen) Send('status');
    }
}

// The Saved flag shows when a status carries every value of the saves that wait for it. A value that no status carried within its window gets no flag.
function ConfirmSaves(s) {
    const ids = Object.keys(awaitingSave);
    if (ids.length === 0) return;
    let confirmed = false;
    for (const id of ids) {
        if (hasOwn(s.settings, id) && SameValue(s.settings[id], awaitingSave[id].value)) { delete awaitingSave[id]; confirmed = true; if (id === 'imageSites') imageSavedMark = true; }
    }
    if (confirmed && Object.keys(awaitingSave).length === 0) FlashSaved();
}

// What the action puts in a status besides the settings: why the last save was refused or cleaned, how full the settings are, and that they came back from the backup copy
function RenderNotices(s) {
    const note = $('save-note');
    note.hidden = !s.saveNote;
    note.textContent = s.saveNote;
    const r = s.routing;
    const crowded = !!r && r.settingsLimit > 0 && r.settingsBytes > r.settingsLimit * 0.7;
    const size = $('settings-size');
    size.hidden = !crowded;
    size.textContent = crowded ? `Settings use ${r.settingsBytes.toLocaleString('en-US')} of ${r.settingsLimit.toLocaleString('en-US')} bytes.` : '';
    const mirror = $('mirror-note');
    if (s.settingsRestored === 'mirror') mirror.hidden = store.get(MIRROR_KEY) === '1';
    else { mirror.hidden = true; if (store.get(MIRROR_KEY) !== null) store.remove(MIRROR_KEY); }      // a later restore shows the note again
}

function FlashSaved() {
    $('saved-flag').hidden = false;
    $('advanced-saved').hidden = false;                       // the Settings header can be scrolled out of sight
    $('updates-saved').hidden = false;                        // the two switches in the Updates card sit at the bottom of the page
    if (imageSavedMark) { $('image-sites-saved').hidden = false; imageSavedMark = false; }       // Images in messages has its own mark in its group
    clearTimeout(savedFlagTimer);
    savedFlagTimer = setTimeout(() => { $('saved-flag').hidden = true; $('advanced-saved').hidden = true; $('updates-saved').hidden = true; $('image-sites-saved').hidden = true; }, 1800);
}

// Settings used to live in this page's browser storage. Offer the old printer name once.
let legacyPrinter = null;
function LegacyPrinterName() {
    if (legacyPrinter === null) {
        legacyPrinter = '';
        for (const key of store.keys()) {
            if (key && key.endsWith('::printer-name') && store.get(key)) { legacyPrinter = store.get(key); break; }
        }
    }
    return legacyPrinter;
}

function OfferLegacyPrinter(s) {
    const old = LegacyPrinterName();
    const usable = old && !str(s.settings.printer) && s.printer.installed.some(n => n.toLowerCase() === old.toLowerCase());
    $('legacy-printer').hidden = !usable || s.printer.name.toLowerCase() === old.toLowerCase();
    $('legacy-printer-name').textContent = old;
}

function UseLegacyPrinter() {
    pendingSettings.printer = LegacyPrinterName();
    $('legacy-printer').hidden = true;
    SaveSettings();
}


//////////////////
// TEST/PREVIEW //
//////////////////

function TestPrint() {
    // 3.0.4: the values of the form under the list (see TEST PRINTS WITH YOUR VALUES below). undefined: the sample itself, as before. null: a value is not allowed, the form
    // says which, and nothing is sent
    const event = TestEventToSend();
    if (event === null) return;
    const button = $('test-print-button');
    button.disabled = true;
    setTimeout(() => { button.disabled = false; }, 1500);
    // Edits are saved a moment after you stop typing. A test shouldn't beat them to the action, so it carries them with it. An edit that was held back because the
    // action could not be reached is among them, so a test never prints with a setting that the dock does not show.
    const unsaved = { ...pendingSettings };
    const hasUnsaved = Object.keys(unsaved).length > 0;
    if (hasUnsaved) SaveSettings();             // the same save as any other, with the same handling of a failure (an older action ignores the copy sent with the test)
    const follow = PrintersTestFollowsRules();          // 3.0.0-beta.4: the rules choose the printers, and "printers" is not sent
    const printers = follow ? undefined : PrintersTestTarget();              // 3.0: "all" or the number of one printer, as text. Nothing with one printer
    Send('testPrint', { sample: $('sample').value, ...(event ? { event: JSON.stringify(event) } : {}), ...(follow ? { followRules: true } : printers ? { printers } : {}), ...(hasUnsaved ? { settingsJson: JSON.stringify(unsaved) } : {}) });
}

function TogglePreview() {
    previewOpen = !previewOpen;
    $('preview-box').hidden = !previewOpen;
    $('preview-button').textContent = previewOpen ? 'Hide last receipt' : 'Show last receipt';
    if (previewOpen) Send('preview');
}

function RenderPreview(p) {
    const png = typeof p.png === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(p.png) ? p.png : '';
    if (!png) {
        $('preview-img').removeAttribute('src');
        // A receipt can be too tall to show here. The action then sends a sentence in place of the picture.
        const note = str(p.note, 300);
        if (note) lastPreviewAt = str(p.at, 60);                 // this receipt is dealt with: no need to ask for its picture again
        $('preview-caption').textContent = note || 'No receipt yet. Click Test print.';
        return;
    }
    $('preview-img').src = 'data:image/png;base64,' + png;
    lastPreviewAt = str(p.at, 60);
    $('preview-caption').textContent = `${Math.round(num(p.width))}\u00D7${Math.round(num(p.height))}, exactly what the printer receives`;
}


//////////////////////////////////
// TEST PRINTS WITH YOUR VALUES //
//////////////////////////////////

// 3.0.4. Streamer.bot's own tests of an event (of a YouTube Super Chat above all) send what Streamer.bot chooses, so the Test card lets the person type the values of any event
// that Printer Bot prints. Under the list of the card the chosen entry shows its values: first the ones its receipt reads (TEST_EVENTS in catalog.js), then, under More values,
// every other parameter of its trigger (ROUTE_CATALOG), which the routing rules can test, and any other value the person names. They start as the values of the sample, or as
// values of our own for a trigger that has no sample. What the person types is kept in this browser for each entry (pbTestValues.<entry>) until Reset to the sample.
// Test print sends the values with testPrint as  event: { trigger, values }, as Streamer.bot would send the parameters: a number as a number, yes or no as true or false, a list
// typed one entry per line as indexed names, an amount in millionths (microAmount) shown in whole units. An empty box is not sent. Values that are still the sample's send
// the sample itself, as before 3.0.4, so that receipt is the sample's own (the long cheer at the Twitch High Roller threshold, a Hype Train step with the test train). The action
// marks a receipt made from typed values with TEST at its bottom.
// The event goes as JSON text (3.0.7), as the values of a route check and the settings do: Streamer.bot does not pass an object in the arguments of an action through as it
// is, and an action of 3.0.4 to 3.0.6 refused every typed test print with "The dock sent an event that cannot be read". An action of 3.0.7 reads the text.
// Only an action that reports status.testEvents (3.0.4) takes an event: with an older one the card is the card of 3.0.3, with no values and no event. The page holds the
// values to the limits the action names there, and a value it would refuse stops the test print here, with the reason next to the value. Names and values from the browser
// storage or a status go into the page with textContent and value only, so they can never become markup.

const TEST_DEFAULT_LIMITS = { maxValues: 600, maxKeyChars: 80, maxTextChars: 4000 };       // what the action of 3.0.4 takes, for a status that names a limit badly
const TEST_LIMIT_CEILINGS = { maxValues: 5000, maxKeyChars: 200, maxTextChars: 100000 };    // a status that names more is held to this
const TEST_MAX_NUMBER = 1e15;               // the largest number, plus or minus, that the action takes as a value
const TEST_NAME = /^[A-Za-z][A-Za-z0-9_.[\]]*$/;
const TEST_RESERVED = ['isTest', 'sample', 'values', 'event', 'printers', 'followRules', 'pbCommand', 'triggerCustomCodeEventName', 'userProfileUrl', 'gifterProfileUrl', 'stickerImageUrl', 'profileImageUrl'];
const TEST_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const TEST_CURRENCY = /^[A-Za-z]{3}$/;
const TEST_ITEM = /^(\d{1,15})\s*[xX]\s+(\S.*)$/;      // a line of an order: "2 x Shirt" (a line without a number is one of the item)
const TEST_KINDS = [['text', 'text'], ['number', 'a number'], ['flag', 'yes or no']];
const TEST_LIST_NOTE = 'A list of more than 100 lines counts as 10 of the 20 test prints a minute.';      // the action counts it like the big gift bomb sample
const TEST_LIST_NAMES = { gift:'gift.recipientUser0, gift.recipientUser1, ...', kick: 'recipient.0.userName, recipient.1.userName, ...', items: 'fw.variants[0].quantity, fw.variants[0].name, ...' };
const TEST_STORE_KEY = 'pbTestValues.';     // + the entry
const TEST_STORE_MAX = 300000;              // the most characters kept for one entry
const TEST_SAME_TEXT = 'These are the values of the sample, so Test print prints the sample.';
const TEST_CHANGED_TEXT = 'Test print prints your values. The receipt says TEST at its bottom.';
const TEST_OWN_TEXT = 'Test print prints these values. The receipt says TEST at its bottom.';
const TEST_WRONG_TEXT = 'Test print sends nothing until the values marked above are fixed.';
const TEST_FIX_TEXT = 'Fix the values marked above, then press Test print again.';
const TestCount = (n) => Number(n).toLocaleString('en-US');

let testForm = null;            // the form that shows: { spec, controls, other, baseValues }, or null
let testFormSig = '';           // the entry the form was made for
let testCurrencySig = '';
let testControlSeq = 0;
let testRefused = false;        // the last Test print was stopped by a value that is not allowed, and that value is still there

// status.testEvents: the triggers (only those of the catalog, each once) and the three limits (a whole number of 1 or more, held to the ceiling; anything else is the limit of 3.0.4)
function TestEventsOf(x) {
    if (!isObj(x) || !Array.isArray(x.triggers)) return null;
    const triggers = [];
    for (const t of x.triggers.slice(0, 500)) {
        if (typeof t === 'string' && RT_TRIGGERS.has(t) && hasOwn(TEST_EVENTS.receipt, t) && !triggers.includes(t)) triggers.push(t);
    }
    const limit = (key) => { const v = x[key]; return typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 ? Math.min(v, TEST_LIMIT_CEILINGS[key]) : TEST_DEFAULT_LIMITS[key]; };
    return { triggers, maxValues: limit('maxValues'), maxKeyChars: limit('maxKeyChars'), maxTextChars: limit('maxTextChars') };
}

const TestLimits = () => pbStatus && pbStatus.testEvents ? pbStatus.testEvents : TEST_DEFAULT_LIMITS;

// The entries of the list: the samples of the action (as before 3.0.4) and, with an action that takes typed values, each trigger it takes that no sample stands for, in the order of the catalog
function TestEntries(s) {
    const entries = s.samples.slice();
    if (!s.testEvents) return entries;
    const covered = new Set();
    for (const n of s.samples) if (hasOwn(TEST_EVENTS.samples, n)) covered.add(TEST_EVENTS.samples[n].trigger);
    for (const t of ROUTE_CATALOG.triggers) {
        if (s.testEvents.triggers.includes(t.id) && !covered.has(t.id) && !entries.includes(t.id) && hasOwn(TEST_EVENTS.defaults, t.id)) entries.push(t.id);
    }
    return entries;
}

// The entries of the list in groups, one for each platform, in the order of the trigger list of a rule (the owner, 15 October 2026: the list was to be grouped as that one is).
// An entry goes under the platform of its trigger and, within it, in the order of the catalog; a sample that names no trigger here (the end-to-end Hype Train test) goes
// under the platform its name starts with, after the others. The values and the texts of the entries are what they were.
const TEST_PLATFORMS = ['Twitch', 'YouTube', 'Kick', 'StreamElements', 'Streamlabs', 'Fourthwall'];
function TestEntryGroups(entries) {
    const order = ROUTE_CATALOG.triggers.map(t => t.id);
    const triggerOf = (n) => hasOwn(TEST_EVENTS.samples, n) ? TEST_EVENTS.samples[n].trigger : n;
    const placed = entries.map((n, i) => {
        const t = RT_TRIGGERS.get(triggerOf(n));
        const at = order.indexOf(triggerOf(n));
        return { n, i, platform: t ? t.platform : (TEST_PLATFORMS.find(p => n.startsWith(p)) || 'Other'), at: at < 0 ? order.length : at };
    });
    const groups = [];
    for (const platform of TEST_PLATFORMS.concat(['Other'])) {
        const items = placed.filter(e => e.platform === platform).sort((a, b) => a.at - b.at || a.i - b.i);
        if (!items.length) continue;
        const g = document.createElement('optgroup');
        g.label = platform;
        g.append(...items.map(e => new Option(e.n, e.n)));
        groups.push(g);
    }
    return groups;
}

// The form of an entry: { key, trigger, base (the values it starts with), sample (a sample of the action, sent by its name while its values are the sample's) }, or null for an entry
// that has none: an action that takes no typed values, the end-to-end Hype Train test, a sample this page does not know, a trigger the action does not take
function TestEntrySpec(key) {
    const s = pbStatus;
    if (!s || !s.testEvents || typeof key !== 'string' || key === '') return null;
    let trigger, base, sample;
    if (s.samples.includes(key)) {
        if (!hasOwn(TEST_EVENTS.samples, key)) return null;
        const spec = TEST_EVENTS.samples[key];
        trigger = spec.trigger; base = Object.assign({}, spec.values); sample = true;
        // the long cheer is a High Roller cheer whatever the threshold is: its bits are the threshold when that is above 100, as in the receipt page
        if (spec.bitsAtThreshold) base.bits = Math.max(base.bits, parseInt($('highRollerBits').value, 10) || 0);
    } else if (hasOwn(TEST_EVENTS.defaults, key)) {
        trigger = key; base = Object.assign({}, TEST_EVENTS.defaults[key]); sample = false;
    } else return null;
    if (!s.testEvents.triggers.includes(trigger) || !RT_TRIGGERS.has(trigger)) return null;
    return { key, trigger, base, sample };
}

// The fields of a trigger: the values its receipt reads, in the order of TEST_EVENTS, and every other field of the catalog (More values)
function TestFieldsOf(trigger) {
    const all = RT_TRIGGERS.get(trigger).fields;
    const receipt = [], more = [], taken = new Set();
    for (const item of TEST_EVENTS.receipt[trigger]) {
        let f = null;
        if (typeof item === 'string') f = all.find(x => x.name === item) || null;
        else if (item.list) f = { list: item.list, label: item.label, name: '', type: 'list' };
        else if (item.money) {
            const at = all.find(x => x.name === item.name);
            f = at ? Object.assign({}, at, { money: true, shown: item.shown || '', currency: item.currency || '', note: item.note || '', label: item.shown ? 'Amount' : at.label }) : null;
            if (f && f.shown) taken.add(f.shown);
        }
        else if (item.note) { const at = all.find(x => x.name === item.name); f = at ? Object.assign({}, at, { note: item.note }) : null; }
        else f = { name: item.name, label: item.label, type: item.type };
        if (!f) continue;
        receipt.push(f);
        if (f.name) taken.add(f.name);
    }
    for (const f of all) if (!taken.has(f.name)) more.push(f);
    return { receipt, more };
}

// One value of the form: a row with the label, the name of the parameter, a sentence when there is one and the message of a value that is not allowed, and the box
function TestControl(f) {
    const id = 'test-v-' + (++testControlSeq);
    const c = { f, key: f.list ? 'list:' + f.list : f.name, type: f.list ? 'list' : f.type, factor: f.factor || 1, currency: f.name === 'currencyCode' };
    let el;
    if (c.type === 'flag') el = RtSelect([['', '(not sent)'], ['true', 'yes'], ['false', 'no']], '', { id });
    else if (f.choices) el = RtSelect([['', '(not sent)']].concat(f.choices), '', { id });      // a value with a fixed set (the tier of a sub): a real dropdown (the owner, 15 October 2026)
    else if (c.type === 'list' || (c.type === 'text' && TEST_EVENTS.long.includes(f.name))) {
        el = h('textarea', { id, class: 'test-text', rows: c.type === 'list' ? '6' : '3', spellcheck: 'false', placeholder: c.type !== 'list' ? 'Not sent' : f.list === 'items' ? 'One item per line' : 'One name per line' });
    } else {
        el = h('input', { id, type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'Not sent' });
        if (c.type === 'number') el.setAttribute('inputmode', 'decimal');
        if (c.currency) el.setAttribute('list', 'test-currencies');                 // the currencies of the action, and any other code of three letters
    }
    el.setAttribute('data-name', c.key);
    const note = f.note || (f.list ? TEST_LIST_NOTE : '');
    const described = [id + '-name'];
    if (note) described.push(id + '-note');
    described.push(id + '-error');
    el.setAttribute('aria-describedby', described.join(' '));
    c.el = el;
    c.err = h('p', { class: 'field-error', id: id + '-error', hidden: '' });
    c.row = h('div', { class: 'setting stack-narrow test-field' + (el.tagName === 'TEXTAREA' ? ' test-field-long' : '') },
        h('div', null,
            h('label', { class: 'setting-label', for: id }, f.label),
            h('div', { class: 'setting-description test-field-name', id: id + '-name' }, f.list ? TEST_LIST_NAMES[f.list] : f.name),
            note ? h('div', { class: 'setting-description', id: id + '-note' }, note) : null,
            c.err),
        el);
    el.addEventListener('input', TestEdited);
    el.addEventListener('change', TestEdited);
    return c;
}

// A value under Other values: its name, its kind, its value and a button that takes it out
function TestOtherRow(form, name, kind, text) {
    const r = { err: h('p', { class: 'field-error', id: 'test-o-' + (++testControlSeq) + '-error', hidden: '' }) };
    r.name = h('input', { type: 'text', class: 'test-other-name', autocomplete: 'off', spellcheck: 'false', placeholder: 'Variable name', 'aria-label': 'Variable name', 'aria-describedby': r.err.id });
    r.name.value = name;
    r.kind = RtSelect(TEST_KINDS, TEST_KINDS.some(k => k[0] === kind) ? kind : 'text', { class: 'test-other-kind', 'aria-label': 'Kind of value' });
    const valueBox = (value) => {
        const el = r.kind.value === 'flag'
            ? RtSelect([['true', 'yes'], ['false', 'no']], value === 'false' ? 'false' : 'true', { class: 'test-other-value', 'aria-label': 'Value' })
            : h('input', { type: 'text', class: 'test-other-value', autocomplete: 'off', spellcheck: 'false', placeholder: 'Not sent', 'aria-label': 'Value' });
        if (el.tagName === 'INPUT') { el.value = value; if (r.kind.value === 'number') el.setAttribute('inputmode', 'decimal'); }
        el.setAttribute('aria-describedby', r.err.id);
        el.addEventListener('input', TestEdited);
        el.addEventListener('change', TestEdited);
        return el;
    };
    r.value = valueBox(text);
    r.kind.addEventListener('change', () => { const fresh = valueBox(r.value.tagName === 'INPUT' ? r.value.value : ''); r.value.replaceWith(fresh); r.value = fresh; TestEdited(); });
    r.name.addEventListener('input', TestEdited);
    r.name.addEventListener('change', TestEdited);
    const remove = h('button', { type: 'button', class: 'icon-small', 'aria-label': 'Remove this value', title: 'Remove this value' }, '\u00D7');
    remove.addEventListener('click', () => { const at = form.other.indexOf(r); if (at >= 0) form.other.splice(at, 1); r.row.remove(); TestEdited(); });
    r.row = h('div', { class: 'test-other-row' }, r.name, r.kind, r.value, remove, r.err);
    return r;
}

function TestAddOther(form, name, kind, text) {
    const r = TestOtherRow(form, name, kind, text);
    form.other.push(r);
    $('test-event-other').append(r.row);
    return r;
}

// The lines of a list in an event, in the order of their numbers. covered gets the names that were read
function TestListLines(kind, values, covered) {
    const pattern = kind === 'gift' ? /^gift\.recipientUser(\d+)$/ : kind === 'kick' ? /^recipient\.(\d+)\.userName$/ : /^fw\.variants\[(\d+)\]\.(name|quantity)$/;
    const found = new Map();
    for (const key of Object.keys(values)) {
        const m = pattern.exec(key);
        if (!m) continue;
        const n = Number(m[1]), e = found.get(n) || {};
        if (kind === 'items') e[m[2]] = values[key]; else e.name = values[key];
        found.set(n, e);
        covered.add(key);
    }
    return Array.from(found.keys()).sort((a, b) => a - b).map(n => {
        const e = found.get(n);
        return kind === 'items' && e.quantity != null ? `${str(e.quantity, 40)} x ${str(e.name, 1e6)}` : str(e.name, 1e6);
    });
}

const TestNumberText = (n) => String(Number(n.toPrecision(15)));

// The text a box shows for a value of the event (an amount in millionths in whole units, yes or no as the list entry, a list one entry per line)
function TestTextOf(c, values, covered) {
    if (c.type === 'list') return TestListLines(c.f.list, values, covered).join('\n');
    if (!hasOwn(values, c.key)) return '';
    covered.add(c.key);
    if (c.f.money && c.f.shown) covered.add(c.f.shown);
    const v = values[c.key];
    if (c.type === 'flag') return v === true ? 'true' : v === false ? 'false' : '';
    if (c.f.money && typeof v === 'number') return (v / c.factor).toFixed(2);
    if (c.type === 'number' && typeof v === 'number') return TestNumberText(v / c.factor);
    return str(v, 1e6);
}

function TestSetBox(el, text) {
    el.value = text;
    if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.selectedIndex = 0;
}

// Puts values into the form: the values of the entry, or what the person typed (saved, as TestLoad reads it). A value of the entry that no box holds goes under Other values
function TestFill(form, saved) {
    const covered = new Set();
    for (const c of form.controls) {
        const text = TestTextOf(c, form.spec.base, covered);
        // a saved value that a dropdown does not offer (typed into the box of an older version, such as tier 7) gives way to the entry's own value
        const keep = saved && hasOwn(saved.f, c.key) && (c.el.tagName !== 'SELECT' || Array.prototype.some.call(c.el.options, o => o.value === saved.f[c.key]));
        TestSetBox(c.el, keep ? saved.f[c.key] : text);
    }
    for (const r of form.other) r.row.remove();
    form.other = [];
    const rows = saved ? saved.o : Object.keys(form.spec.base).filter(n => !covered.has(n)).map(n => {
        const v = form.spec.base[n];
        return [n, typeof v === 'boolean' ? 'flag' : typeof v === 'number' ? 'number' : 'text', typeof v === 'boolean' ? String(v) : str(v, 1e6)];
    });
    for (const row of rows) TestAddOther(form, row[0], row[1], row[2]);
}

// What the person typed for an entry, from the browser storage, or null. Only texts are taken, and only rows of the three kinds.
function TestLoad(key) {
    let doc = null;
    try {
        const text = store.get(TEST_STORE_KEY + key);
        if (typeof text === 'string' && text.length <= TEST_STORE_MAX) doc = JSON.parse(text);
    } catch (e) { doc = null; }
    if (!isObj(doc) || doc.v !== 1 || !isObj(doc.f)) return null;
    const f = Object.create(null);
    for (const k of Object.keys(doc.f)) if (typeof doc.f[k] === 'string') f[k] = doc.f[k];
    const o = (Array.isArray(doc.o) ? doc.o : []).filter(r => Array.isArray(r) && r.length === 3 && typeof r[0] === 'string' && TEST_KINDS.some(k => k[0] === r[1]) && typeof r[2] === 'string')
        .slice(0, TestLimits().maxValues);
    return { f, o };
}

function TestSave(form) {
    const f = {};
    for (const c of form.controls) f[c.key] = c.el.value;
    let text;
    try { text = JSON.stringify({ v: 1, f, o: form.other.map(r => [r.name.value, r.kind.value, r.value.value]) }); } catch (e) { return; }
    if (text.length > TEST_STORE_MAX) store.remove(TEST_STORE_KEY + form.spec.key);
    else store.set(TEST_STORE_KEY + form.spec.key, text);
}

// What is wrong with a name, or ''
function TestNameProblem(name, limits) {
    if (name.length > limits.maxKeyChars || !TEST_NAME.test(name)) return `A name starts with a letter and holds only letters, digits and _ . [ ], at most ${limits.maxKeyChars} characters.`;
    if (TEST_RESERVED.some(r => r.toLowerCase() === name.toLowerCase())) return `"${name}" cannot be set in a test print.`;
    return '';
}

// A number as it is typed: { value } (times the factor of the field), or { error }
function TestNumberOf(text, factor) {
    const t = text.trim();
    if (!TEST_NUMBER.test(t)) return { error: 'Enter a number, such as 5 or 2.50 (with a point), or leave the box empty.' };
    let n = Number(t);
    if (factor !== 1) n = Math.round(n * factor);
    if (!Number.isFinite(n) || Math.abs(n) > TEST_MAX_NUMBER) { const most = TestCount(TEST_MAX_NUMBER / factor); return { error: `Enter a number from -${most} to ${most}.` }; }
    return { value: n };
}

// Reads one box into values. A value that is not allowed goes into bad as { el, err, msg }
function TestRead(c, limits, values, bad) {
    const raw = c.el.value;
    let msg = '';
    const put = (name, v) => { if (!msg) msg = TestNameProblem(name, limits); if (!msg) values[name] = v; };
    if (c.type === 'list') {
        const lines = raw.split('\n').map(l => l.trim()).filter(l => l !== '');
        const long = lines.findIndex(l => l.length > limits.maxTextChars);
        if (lines.length > limits.maxValues) msg = `This list has ${TestCount(lines.length)} lines. Printer Bot tests at most ${TestCount(limits.maxValues)} values in all.`;
        else if (long >= 0) msg = `Line ${long + 1} is longer than ${TestCount(limits.maxTextChars)} characters.`;
        else lines.forEach((line, i) => {
            if (c.f.list === 'gift') put('gift.recipientUser' + i, line);
            else if (c.f.list === 'kick') put('recipient.' + i + '.userName', line);
            else { const m = TEST_ITEM.exec(line); put(`fw.variants[${i}].quantity`, m ? Number(m[1]) : 1); put(`fw.variants[${i}].name`, m ? m[2] : line); }
        });
    }
    else if (raw === '' || (c.type !== 'text' && raw.trim() === '')) { }             // an empty box is not sent
    else if (c.type === 'flag') put(c.f.name, raw === 'true');
    else if (c.type === 'number') {
        const n = TestNumberOf(raw, c.factor);
        if (n.error) msg = n.error;
        else if (c.f.money && Math.abs(Number(raw.trim()) * 100 - Math.round(Number(raw.trim()) * 100)) > 1e-6) msg = 'Enter an amount with at most two digits after the point, such as 5 or 2.50.';
        else put(c.f.name, n.value);
    }
    else if (c.currency) { if (TEST_CURRENCY.test(raw.trim())) put(c.f.name, raw.trim().toUpperCase()); else msg = 'Enter a currency code of three letters, such as USD, or leave the box empty.'; }
    else if (raw.length > limits.maxTextChars) msg = `This text has ${TestCount(raw.length)} characters. Printer Bot takes at most ${TestCount(limits.maxTextChars)}.`;
    else put(c.f.name, raw);
    if (msg) bad.push({ el: c.el, err: c.err, msg });
}

// Reads a value under Other values. A row with no name and no value is left out, and so is a value that is empty
function TestReadOther(form, r, limits, values, bad) {
    const name = r.name.value.trim(), raw = r.value.value, kind = r.kind.value;
    let msg = '', at = r.name;
    if (name === '' && (kind === 'flag' || raw.trim() === '')) return;
    if (name === '') msg = 'Give this value a name.';
    else if ((msg = TestNameProblem(name, limits))) { }
    else if (hasOwn(values, name) || form.controls.some(c => c.key === name)) msg = `"${name}" is already one of the values above.`;
    else {
        at = r.value;
        if (kind === 'flag') values[name] = raw === 'true';
        else if (raw.trim() === '') { }
        else if (kind === 'number') { const n = TestNumberOf(raw, 1); if (n.error) msg = n.error; else values[name] = n.value; }
        else if (raw.length > limits.maxTextChars) msg = `This text has ${TestCount(raw.length)} characters. Printer Bot takes at most ${TestCount(limits.maxTextChars)}.`;
        else values[name] = raw;
    }
    if (msg) bad.push({ el: at, err: r.err, msg });
}

// The values of the form: { values, bad (the values that are not allowed), problem (a sentence about the event as a whole, or '') }
function TestCollect(form) {
    const limits = TestLimits();
    const values = {}, bad = [];
    for (const c of form.controls) TestRead(c, limits, values, bad);
    for (const c of form.controls) if (c.f.money && c.f.shown && typeof values[c.f.name] === 'number') values[c.f.shown] = TestMoneyText(values[c.f.name] / c.factor, values[c.f.currency]);
    for (const r of form.other) TestReadOther(form, r, limits, values, bad);
    const count = Object.keys(values).length;
    const problem = count > limits.maxValues ? `This event has ${TestCount(count)} values. Printer Bot tests at most ${TestCount(limits.maxValues)}, so take some out.` : '';
    return { values, bad, problem };
}

// An amount as Streamer.bot shows it with its currency, such as $5.00 or \u20ac25.50 (the amount as shown of a Super Chat). Without a currency it can format, the amount and the code
function TestMoneyText(amount, code) {
    if (typeof code === 'string' && code !== '') {
        try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount); } catch (e) { }
    }
    return amount.toFixed(2) + (typeof code === 'string' && code !== '' ? ' ' + code : '');
}

const TestSame = (a, b) => CanonicalJson(a) === CanonicalJson(b);

// Shows what is wrong next to each value, says what Test print does now, and returns the values
function TestRefresh(form) {
    const result = TestCollect(form);
    for (const c of form.controls) { c.err.textContent = ''; c.err.hidden = true; c.el.removeAttribute('aria-invalid'); }
    for (const r of form.other) { r.err.textContent = ''; r.err.hidden = true; r.name.removeAttribute('aria-invalid'); r.value.removeAttribute('aria-invalid'); }
    for (const b of result.bad) {
        if (b.err.hidden) { b.err.textContent = b.msg; b.err.hidden = false; }
        b.el.setAttribute('aria-invalid', 'true');
    }
    const wrong = result.bad.length > 0 || result.problem !== '';
    if (!wrong) testRefused = false;
    $('test-event-state').textContent = wrong ? TEST_WRONG_TEXT : !form.spec.sample ? TEST_OWN_TEXT : TestSame(result.values, form.baseValues) ? TEST_SAME_TEXT : TEST_CHANGED_TEXT;
    const line = $('test-event-problem');
    line.textContent = wrong && testRefused ? 'Nothing was sent. ' + (result.problem || TEST_FIX_TEXT) : result.problem;
    line.hidden = !line.textContent;
    $('test-event-add-button').disabled = form.other.length >= TestLimits().maxValues;
    return result;
}

function TestBuildForm(spec) {
    const fields = TestFieldsOf(spec.trigger);
    const form = { spec, controls: [], other: [], baseValues: {} };
    const rows = (list) => list.map(f => { const c = TestControl(f); form.controls.push(c); return c.row; });
    $('test-event-fields').replaceChildren(...rows(fields.receipt));
    $('test-event-more-fields').replaceChildren(...rows(fields.more));
    $('test-event-other').replaceChildren();
    $('test-event-more').open = false;
    $('test-event-reset-button').textContent = spec.sample ? 'Reset to the sample' : 'Reset to the defaults';
    TestFill(form, null);
    form.baseValues = TestCollect(form).values;          // the values of the entry as the form sends them
    const saved = TestLoad(spec.key);
    if (saved) TestFill(form, saved);
    return form;
}

// The form of the chosen entry. It is made again only when the entry changes (or the action stops or starts taking it), so a status never takes what the person is typing
function RenderTestEditor() {
    RenderTestCurrencies();
    const spec = TestEntrySpec($('sample').value);
    const sig = spec ? `${spec.key}|${spec.trigger}|${spec.sample}` : '';
    if (sig === testFormSig) { if (testForm) TestRefresh(testForm); return; }
    testFormSig = sig;
    testRefused = false;
    if (!spec) {
        testForm = null;
        $('test-event').hidden = true;
        $('test-event').removeAttribute('data-trigger');
        for (const id of ['test-event-fields', 'test-event-more-fields', 'test-event-other']) $(id).replaceChildren();
        return;
    }
    testForm = TestBuildForm(spec);
    $('test-event').setAttribute('data-trigger', spec.trigger);          // the trigger the values are sent as
    $('test-event').hidden = false;
    TestRefresh(testForm);
}

// The currencies offered for currencyCode: the ones of status.exchange (the list of YouTube currency), each as its code with its name
function RenderTestCurrencies() {
    const list = pbStatus && pbStatus.exchange ? pbStatus.exchange.currencies : [];
    const sig = JSON.stringify(list);
    if (sig === testCurrencySig) return;
    testCurrencySig = sig;
    $('test-currencies').replaceChildren(...list.map(c => { const o = document.createElement('option'); o.value = c.code; o.textContent = c.name || c.code; return o; }));
}

function TestEdited() {
    if (!testForm) return;
    TestSave(testForm);
    TestRefresh(testForm);
}

// The event of a Test print: undefined for the sample itself (no form, or the sample's own values), null when a value is not allowed (nothing is sent), else { trigger, values }
function TestEventToSend() {
    if (!testForm || $('test-event').hidden) return undefined;
    const result = TestCollect(testForm);
    if (result.bad.length || result.problem) {
        testRefused = true;
        TestRefresh(testForm);
        const first = result.bad.length ? result.bad[0].el : null;
        if (first) { if ($('test-event-more').contains(first)) $('test-event-more').open = true; first.focus(); }
        return null;
    }
    if (testForm.spec.sample && TestSame(result.values, testForm.baseValues)) return undefined;
    return { trigger: testForm.spec.trigger, values: result.values };
}

function TestReset() {
    if (!testForm) return;
    store.remove(TEST_STORE_KEY + testForm.spec.key);
    const spec = TestEntrySpec(testForm.spec.key);           // the values of now (the long cheer follows the threshold as it is now)
    if (!spec) return;
    testRefused = false;
    testForm = TestBuildForm(spec);
    TestRefresh(testForm);
}

function TestAddValue() {
    if (!testForm || testForm.other.length >= TestLimits().maxValues) return;
    const r = TestAddOther(testForm, '', 'text', '');
    TestRefresh(testForm);
    r.name.focus();
}


///////////
// SETUP //
///////////

// SHA-256 in plain JavaScript: crypto.subtle only exists on https and localhost pages, and this dock may be served over plain http.
const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

function Sha256Hex(bytes) {
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const len = bytes.length;
    const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[len] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(len / 0x20000000), false);              // the length in bits, as 64 bits
    view.setUint32(padded.length - 4, (len % 0x20000000) * 8, false);
    const w = new Uint32Array(64);
    for (let off = 0; off < padded.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
        for (let i = 16; i < 64; i++) {
            const a = w[i - 15], b = w[i - 2];
            const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
            const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;                                       // a Uint32Array wraps at 32 bits
        }
        let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], hh = H[7];
        for (let i = 0; i < 64; i++) {
            const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + SHA256_K[i] + w[i]) | 0;
            const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
            hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += hh;
    }
    return Array.from(H, x => x.toString(16).padStart(8, '0')).join('');
}

// Copies text. Returns 'copied' when the clipboard took it. Otherwise it puts the text into the given read-only box (selected,
// ready for Ctrl+C) and returns 'manual'. Plain-http pages have no navigator.clipboard, which used to fail silently.
async function CopyText(text, box) {
    try {
        if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return 'copied';
        }
    } catch (err) { console.warn('Clipboard API refused:', err); }
    if (box) {
        box.hidden = false;
        box.value = text;
        box.focus();
        box.select();
        try { if (document.execCommand('copy')) return 'copied-box'; } catch (err) { }
    }
    return 'manual';
}

// The result area under a Copy import code button: the hash of what was copied, and the code itself when copying did not work
function ImportBox(host) {
    if (!host.firstChild) {
        host.append(
            h('p', { class: 'hint import-hash' }),
            h('p', { class: 'hint import-compare' }, `Compare it with the SHA-256 in ${IMPORT_SUM_FILE} from the download you got Printer Bot from. A copy from the same web host proves nothing.`),
            h('p', { class: 'hint import-manual' }, 'Your browser would not copy it. Press Ctrl+C now (the code is selected below), then paste it into Streamer.bot Import.'),
            h('textarea', { class: 'import-code', readonly: '', rows: '4', 'aria-label': 'Import code', spellcheck: 'false' }));
    }
    return {
        hash: host.querySelector('.import-hash'), compare: host.querySelector('.import-compare'),
        manual: host.querySelector('.import-manual'), area: host.querySelector('textarea'),
    };
}

async function CopyImportCode(button, host) {
    const label = button.dataset.label || (button.dataset.label = button.textContent);
    const box = ImportBox(host);
    host.hidden = false;
    box.area.hidden = true;
    box.manual.hidden = true;
    box.compare.hidden = false;
    let outcome = 'manual';
    try {
        // The latest action is the one to import, whichever dock page version is open. Its code sits at the top of the web host, two folders up from here.
        const res = await fetch(new URL('../../' + IMPORT_FILE, location.href), { cache: 'no-store', credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const code = (await res.text()).trim();
        if (!code) throw new Error('the file is empty');
        box.hash.textContent = 'SHA-256 of the text copied: ' + Sha256Hex(new TextEncoder().encode(code));
        outcome = await CopyText(code, box.area);
        box.manual.hidden = outcome === 'copied-box' || outcome === 'copied';
        button.textContent = outcome === 'copied' || outcome === 'copied-box' ? 'Copied! Now import it in Streamer.bot' : 'Select the code below and copy it';
    } catch (err) {
        console.warn('Could not copy import code:', err);
        box.compare.hidden = true;
        box.hash.textContent = `Could not load ${IMPORT_FILE} (${err.message}). Open ${IMPORT_FILE} on the web host and copy it by hand.`;
        button.textContent = `Could not copy. Open ${IMPORT_FILE} and copy it by hand.`;
    }
    setTimeout(() => { button.textContent = label; }, 4000);
}

function IsAbsolutePath(p) { return /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]/.test(p); }

function RenderFolder(s) {
    $('folder').textContent = s.folder;
    $('folder-hint').hidden = !s.folder || IsAbsolutePath(s.folder);
}

async function CopyFolder() {
    if (!pbStatus) return;
    const button = $('copy-folder-button');
    let outcome = 'manual';
    try {
        if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(pbStatus.folder); outcome = 'copied'; }
    } catch (err) { console.warn('Could not copy:', err); }
    if (outcome !== 'copied') {                         // no clipboard API here: use a throw-away box, else select the text for Ctrl+C
        const tmp = h('textarea', { readonly: '', class: 'offscreen' });
        tmp.value = pbStatus.folder;
        document.body.append(tmp);
        tmp.select();
        try { if (document.execCommand('copy')) outcome = 'copied'; } catch (err) { }
        tmp.remove();
        if (outcome !== 'copied') {
            const range = document.createRange();
            range.selectNodeContents($('folder'));
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
    button.textContent = outcome === 'copied' ? 'Copied!' : 'Press Ctrl+C to copy';
    setTimeout(() => { button.textContent = 'Copy folder path'; }, 1500);
}


////////////
// BACKUP //
////////////

// Save settings writes what the dock can change (the printers, the rules and the print options) to a file, and Restore settings reads such a file back.
// The three update switches (Download updates, Install updates automatically, Try prerelease versions) are not in the file and a file never sets them,
// so a restored file cannot start a download or an install that the person did not switch on in this dock. The update address belongs to the action and stays out too.
const BACKUP_FORMAT = 1;
const BACKUP_KEYS = ['printer', 'paperWidthMm', 'paperSize', 'mode', 'printProfile', 'letterLayout', 'letterImageFit', 'dither', 'cut', 'feedDots', 'highRollerBits', 'allowHighRoller', 'allowImages', 'allowYouTubeHighRoller', 'uncutHypeTrain', 'highRollerBitsPerInch', 'highRollerMaxInches',
    'youtubeHighRollerAmount', 'youtubeHighRollerAmountPerInch', 'localCurrency',
    'ignoreTestTriggers', 'keepDebugFiles', 'freePrintsPerMinute', 'printersPerBrowser', 'hideLinks', 'imageSites', 'hypeTrain', 'hypeEndWaitSeconds', 'extraPrinters', 'routing',
    'vcConnection', 'vcAddress', 'vcTapeMm', 'vcQuality', 'vcCut',                                       // 3.2.0: the sticker printer of printer 1 (those of printers 2 and up travel in extraPrinters)
    'paperTray'];                                                                                        // 3.2.0-beta.3: the tray of printer 1 (those of printers 2 and up, and of the rules, travel in extraPrinters and routing)
const BACKUP_TYPES = {
    printer: 'string', mode: 'string', dither: 'string', cut: 'string', paperSize: 'string', printProfile: 'string', letterLayout: 'string', letterImageFit: 'string', localCurrency: 'string',
    vcConnection: 'string', vcAddress: 'string', vcQuality: 'string', vcCut: 'string', vcTapeMm: 'number', paperTray: 'string',
    paperWidthMm: 'number', feedDots: 'number', highRollerBits: 'number', highRollerBitsPerInch: 'number', highRollerMaxInches: 'number', freePrintsPerMinute: 'number', printersPerBrowser: 'number', hypeEndWaitSeconds: 'number',
    youtubeHighRollerAmount: 'number', youtubeHighRollerAmountPerInch: 'number',
    ignoreTestTriggers: 'boolean', keepDebugFiles: 'boolean', hideLinks: 'boolean', hypeTrain: 'boolean', allowHighRoller: 'boolean', allowImages: 'boolean', allowYouTubeHighRoller: 'boolean', uncutHypeTrain: 'boolean',
    extraPrinters: 'array', routing: 'object', imageSites: 'array',
};
const BACKUP_MAX_FILE = 200000;          // the most that is read from a file or a pasted text
const BACKUP_MAX_SETTINGS = 60000;       // the action takes at most 65,536 characters in one saveSettings. The status says its own limit (settingsLimit), which is used when it is there
// 3.2.0: an action that says how long a request may be (routing.requestLimit, 262,144 characters) is measured against that: the text of a file carries every key of every printer, while the action's own
// limit on its file (settingsLimit, 60,000 bytes) is for a file that leaves the defaults out, and a backup of 100 printers is longer than that since the keys of the sticker printer. An action that
// refuses the file for its own limit says so in its note, which the card shows (restoreSent).
const BackupSettingsLimit = () => pbStatus && pbStatus.routing && pbStatus.routing.requestLimit > 0 ? pbStatus.routing.requestLimit
    : pbStatus && pbStatus.routing && pbStatus.routing.settingsLimit > 0 ? pbStatus.routing.settingsLimit : BACKUP_MAX_SETTINGS;
const RESTORE_CHECK_MS = 6000;           // how long the dock waits for the action to confirm a restore

let restoreCandidate = null;             // { settings } of the file that waits for the person's Restore click
let restoreSent = null;                  // after a restore: { settings, timer }, so the next status can say what the action kept

function BackupMessage(text, level) {
    const box = $('backup-message');
    box.textContent = text;
    box.hidden = !text;
    box.classList.toggle('error', level === 'error');
}

const TypeOfValue = (v) => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;

// The same JSON text for the same content, whatever the order of the keys, so a file that was edited by hand still compares equal
function CanonicalJson(v) {
    if (Array.isArray(v)) return '[' + v.map(CanonicalJson).join(',') + ']';
    if (isObj(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + CanonicalJson(v[k])).join(',') + '}';
    return JSON.stringify(v);
}

// The settings as they are on screen: what the action reported, with the edits that are on their way laid over it
function CurrentBackupSettings() {
    const merged = {};
    if (!pbStatus) return merged;
    for (const key of BACKUP_KEYS) {
        if (hasOwn(pendingSettings, key)) merged[key] = pendingSettings[key];
        else if (hasOwn(inFlight, key)) merged[key] = inFlight[key].value;
        else if (hasOwn(pbStatus.settings, key)) merged[key] = pbStatus.settings[key];
    }
    return merged;
}

function BackupFileText() {
    const doc = {
        printerBotSettings: BACKUP_FORMAT,
        savedAt: new Date().toISOString(),
        from: { printerBot: pbStatus ? pbStatus.version : '', dock: FRONTEND_VERSION },
        settings: CurrentBackupSettings(),
    };
    return JSON.stringify(doc, null, 2) + '\n';
}

function BackupFileName() {
    const d = new Date();
    const two = (n) => String(n).padStart(2, '0');
    return `printer-bot-settings-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.json`;
}

// Save settings, 3.0.3. A dock in OBS (the browser of obs-browser) drops a browser download without a word, so up to 3.0.2 no file was ever saved there. A Printer Bot that
// reports status.backup writes the file itself: the page sends it the text of the file (saveBackup) and waits for a status whose backup.seq is above the one it saw when it
// sent, at most BACKUP_SAVE_WAIT_MS. The button is off meanwhile, so one click is one file. An older Printer Bot gets the browser download, with words that say what OBS does with it.
const BACKUP_SAVE_WAIT_MS = RESTORE_CHECK_MS;
let backupSaving = null;                 // while a saveBackup waits for its answer: { seq: status.backup.seq when it was sent, timer }

const SAVE_TEXT_ACTION = 'Printer Bot writes your printers, routing rules and print options to a file in its backups folder, inside the Streamer.bot folder. Copy the file somewhere else as well: if Streamer.bot ever loses its data, Restore settings brings the settings back from it.';
const SAVE_TEXT_BROWSER = 'Saves your printers, routing rules and print options to a file in the downloads of your browser. A dock in OBS cannot download files: update Printer Bot, or use Settings as text below. If Streamer.bot ever loses its data, Restore settings brings them back.';
const RESTORE_TEXT_ACTION = 'Reads a file made by Save settings, such as one from the backups folder of Printer Bot. You see what it holds before anything changes.';
const RESTORE_TEXT_BROWSER = 'Reads a file made by Save settings. You see what it holds before anything changes.';
const BACKUP_SAVING_TEXT = 'Saving the settings file\u2026';
const BACKUP_UNCONFIRMED_TEXT = 'Printer Bot did not confirm the save, so the file may be missing. Use Settings as text below to keep a copy of your settings.';
const BACKUP_UPDATE_TEXT = 'Update Printer Bot (from 3.0.3 on it saves the file itself), or use Settings as text below.';

// The two descriptions of the card, for the Printer Bot the dock talks to
function RenderBackupCard(s) {
    const own = !!s.backup;
    const set = (id, text) => { if ($(id).textContent !== text) $(id).textContent = text; };
    set('settings-save-description', own ? SAVE_TEXT_ACTION : SAVE_TEXT_BROWSER);
    set('settings-restore-description', own ? RESTORE_TEXT_ACTION : RESTORE_TEXT_BROWSER);
}

// One click. A Printer Bot from 3.0.3 on writes the file. An older one: the browser gets the file, and a dock that cannot download files (a dock in OBS) has the text box below.
function SaveSettingsFile() {
    if (!pbStatus) { BackupMessage('Printer Bot has not answered yet. Connect to Streamer.bot first.', 'error'); return; }
    if (pbStatus.backup) { SaveBackupInAction(); return; }
    const text = BackupFileText();
    const name = BackupFileName();
    try {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = h('a', { href: url, download: name });
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        BackupMessage(`Sent ${name} to the downloads of your browser. A dock in OBS cannot download files, so in OBS no file appears. ${BACKUP_UPDATE_TEXT}`);
    } catch (err) {
        console.warn('Could not save the settings file:', err);
        BackupMessage(`This dock could not save a file. ${BACKUP_UPDATE_TEXT}`, 'error');
    }
}

function SaveBackupInAction() {
    if (backupSaving) return;                                   // one save at a time (the button is off meanwhile)
    const wait = { seq: pbStatus.backup.seq, timer: null };
    backupSaving = wait;
    wait.timer = setTimeout(() => EndBackupSave(wait, null), BACKUP_SAVE_WAIT_MS);
    $('settings-save-button').disabled = true;
    BackupMessage(BACKUP_SAVING_TEXT);
    // A command that did not reach the action (no connection, refused) ends the wait at once
    Send('saveBackup', { text: BackupFileText() }).then(ok => { if (!ok) EndBackupSave(wait, null); });
}

// The end of a save: backup is status.backup of the status that answered it, or null when none did (the wait ran out, or the command did not reach the action)
function EndBackupSave(wait, backup) {
    if (backupSaving !== wait) return;                          // that save is over already
    clearTimeout(wait.timer);
    backupSaving = null;
    $('settings-save-button').disabled = false;
    if (!backup) BackupMessage(BACKUP_UNCONFIRMED_TEXT, 'error');
    else if (backup.ok) BackupMessage(!backup.file ? 'Saved.' : IsAbsolutePath(backup.file) ? `Saved: ${backup.file}` : `Saved in your Streamer.bot folder: ${backup.file}`);
    else BackupMessage(backup.error || 'Printer Bot did not save the settings file.', 'error');
}

// Called with every status: the first one whose backup.seq is above the one of the send answers the save that waits
function CheckBackupSave(s) {
    if (backupSaving && s.backup && s.backup.seq > backupSaving.seq) EndBackupSave(backupSaving, s.backup);
}

function ShowSettingsText() {
    if (!pbStatus) { BackupMessage('Printer Bot has not answered yet. Connect to Streamer.bot first.', 'error'); return; }
    const box = $('settings-text-out');
    box.value = BackupFileText();
    box.hidden = false;
    box.focus();
    box.select();
    box.scrollTop = 0;                  // select() scrolls to the end of the text, and the person should see the start of the file
}

async function CopySettingsText() {
    if (!pbStatus) { BackupMessage('Printer Bot has not answered yet. Connect to Streamer.bot first.', 'error'); return; }
    const box = $('settings-text-out');
    box.value = BackupFileText();
    const outcome = await CopyText(box.value, box);
    BackupMessage(outcome === 'manual' ? 'Your browser would not copy. Press Ctrl+C now, the text is selected.' : 'The text is copied. Paste it into a file or a note to keep it.');
}

function CancelRestore() {
    restoreCandidate = null;
    $('settings-restore-preview').hidden = true;
}

// Reads a settings file or a pasted text and shows what is in it. Nothing changes until the person presses Restore.
function PrepareRestore(text) {
    CancelRestore();
    BackupMessage('');
    if (typeof text !== 'string' || text.length === 0) { BackupMessage('There is nothing to read.', 'error'); return; }
    if (text.length > BACKUP_MAX_FILE) { BackupMessage('That is far larger than a settings file, so it was not read.', 'error'); return; }
    let doc;
    try { doc = JSON.parse(text); } catch (err) { BackupMessage('That is not a settings file. It is not valid JSON.', 'error'); return; }
    if (!isObj(doc) || doc.printerBotSettings !== BACKUP_FORMAT || !isObj(doc.settings)) { BackupMessage('That does not look like a file made by Save settings.', 'error'); return; }
    const settings = {}, skipped = [], wrong = [], outside = [];
    for (const key of Object.keys(doc.settings)) {
        if (!BACKUP_KEYS.includes(key)) { skipped.push(str(key, 40)); continue; }
        if (key === 'imageSites') {
            // 3.0.0-beta.9: the sites that are on, as a list. A file from an older version has no such entry (the setting is left alone), and an entry that is not a list of texts is left out
            // without a word: the other settings of the file are restored. The list is cleaned as the action cleans it, so the check after a restore finds what it sent.
            const ids = CleanSiteIds(doc.settings[key]);
            if (ids !== null) settings[key] = ids;
            continue;
        }
        if (key === 'letterLayout') {
            // 3.0.0-beta.10: the layout of a Letter page. Only the exact texts scaled and message are restored. Any other value (a number, an object, null, a list, other text, capitals, spaces)
            // is left out without a word and the other settings of the file are restored. A file from an older version has no such entry (the setting is left alone).
            if (doc.settings[key] === 'scaled' || doc.settings[key] === 'message') settings[key] = doc.settings[key];
            continue;
        }
        if (key === 'letterImageFit') {
            // 3.0.0: how a picture is set in the large layout. Only the exact texts fill, fit and stretch are restored. Any other value (a number, an object, null, a list, other text, capitals, spaces)
            // is left out without a word and the other settings of the file are restored. A file from an older version has no such entry (the setting is left alone).
            if (RT_FITS.includes(doc.settings[key])) settings[key] = doc.settings[key];
            continue;
        }
        if (key === 'paperTray') {
            // 3.2.0-beta.3: the tray of printer 1. Text is restored cleaned as the action cleans it (so the check after the restore finds what it sent); any other value (a number, an object,
            // null, a list) is left out without a word and the other settings of the file are restored. A file from an older version has no such entry (the setting is left alone).
            if (typeof doc.settings[key] === 'string') settings[key] = RtTrayClean(doc.settings[key]);
            continue;
        }
        if (key === 'localCurrency') {
            // 3.0.2: the currency of the streamer. Only a currency that the action lists (status.exchange.currencies) is restored. Any other value (a code it does not list, other text, a number,
            // null) is left out without a word and the other settings of the file are restored. A file from an older version has no such entry (the setting is left alone).
            if (CurrencyListed(doc.settings[key])) settings[key] = doc.settings[key];
            continue;
        }
        if (TypeOfValue(doc.settings[key]) !== BACKUP_TYPES[key]) { wrong.push(key); continue; }
        if (key === 'printersPerBrowser' && PerBrowserOf(String(doc.settings[key])) === null) { outside.push(key); continue; }
        if (key === 'hypeEndWaitSeconds' && hypeWaitBox.of(String(doc.settings[key])) === null) { outside.push(key); continue; }
        if (key === 'youtubeHighRollerAmount' || key === 'youtubeHighRollerAmountPerInch') {
            // 3.0.2: a number from 0 to 1,000,000,000, sent with two digits after the point as the action keeps it (so the check after the restore finds what it sent). Anything else makes the file unusable.
            const amount = AmountOf(String(doc.settings[key]), false);
            if (amount === null) { outside.push(key); continue; }
            settings[key] = amount;
            continue;
        }
        settings[key] = doc.settings[key];
    }
    if (wrong.length) { BackupMessage(`The file cannot be used. These entries have the wrong kind of value: ${wrong.join(', ')}.`, 'error'); return; }
    if (outside.length) {
        BackupMessage(outside.includes('hypeEndWaitSeconds') ? 'The file cannot be used. The Hype Train end wait must be a whole number of seconds from 90 to 300.'
            : outside.includes('printersPerBrowser') ? `The file cannot be used. Printers per browser must be a whole number from 1 to ${PER_BROWSER_MAX}.`
                : 'The file cannot be used. The YouTube High Roller threshold and the amount per inch must be numbers from 0 to 1,000,000,000.', 'error');
        return;
    }
    if (Object.keys(settings).length === 0) { BackupMessage('The file holds no settings this dock knows.', 'error'); return; }
    if (JSON.stringify(settings).length > BackupSettingsLimit()) { BackupMessage('The settings in the file are larger than Printer Bot accepts.', 'error'); return; }
    // The printers of a file from before 3.0.0-beta.5 have no paper size, print profile or High Roller switch. They are cleaned as the page cleans every printer it sends (the size above is the size of
    // the file as it is), so the file says what the action keeps for them (the defaults), and the check after a restore finds the same printers in the status.
    if (Array.isArray(settings.extraPrinters)) settings.extraPrinters = settings.extraPrinters.map(RtExtraForSending);        // 3.2.0-beta.3: a printer with no tray holds no paperTray, as in the status

    const from = isObj(doc.from) ? doc.from : {};
    const when = typeof doc.savedAt === 'string' && ISO_TIME.test(doc.savedAt) ? new Date(doc.savedAt) : null;
    const printers = 1 + (Array.isArray(settings.extraPrinters) ? settings.extraPrinters.length : 0);
    const rules = isObj(settings.routing) && Array.isArray(settings.routing.rules) ? settings.routing.rules.length : 0;
    const lines = [];
    lines.push(when && !isNaN(when.getTime()) ? `Saved ${when.toLocaleString()}${typeof from.printerBot === 'string' && from.printerBot ? ` by Printer Bot ${str(from.printerBot, 40)}` : ''}.` : 'The file does not say when it was saved.');
    lines.push(`It holds ${printers === 1 ? '1 printer' : printers + ' printers'}, ${rules === 1 ? '1 routing rule' : rules + ' routing rules'} and the print options.`);
    lines.push('Restoring replaces those settings in Printer Bot. The update switches stay as they are.');
    if (skipped.length) lines.push(`This dock does not know ${skipped.length === 1 ? 'this entry' : 'these entries'} and skips ${skipped.length === 1 ? 'it' : 'them'}: ${skipped.slice(0, 8).join(', ')}.`);
    $('settings-restore-summary').replaceChildren(...lines.map(l => h('p', { class: 'hint' }, l)));
    $('settings-restore-preview').hidden = false;
    restoreCandidate = { settings };
}

async function OnSettingsFile(file) {
    if (!file) return;
    if (file.size > BACKUP_MAX_FILE) { CancelRestore(); BackupMessage('That file is far larger than a settings file, so it was not read.', 'error'); return; }
    let text = '';
    try { text = await file.text(); } catch (err) { CancelRestore(); BackupMessage('That file could not be read.', 'error'); return; }
    PrepareRestore(text);
}

function ApplyRestore() {
    if (!restoreCandidate || !pbStatus) return;
    const settings = restoreCandidate.settings;
    CancelRestore();
    clearTimeout(saveTimer);
    pendingSettings = { ...settings };           // edits that were still waiting are replaced by the file
    if (restoreSent) clearTimeout(restoreSent.timer);
    restoreSent = { settings, timer: setTimeout(FinishRestore, RESTORE_CHECK_MS) };
    BackupMessage('Restoring\u2026');
    SaveSettings();
}

// Called with every status while a restore waits, and when the wait is over: says what the action kept
function CheckRestore(final) {
    if (!restoreSent || !pbStatus) return;
    const differing = Object.keys(restoreSent.settings).filter(k => !hasOwn(pbStatus.settings, k) || CanonicalJson(pbStatus.settings[k]) !== CanonicalJson(restoreSent.settings[k]));
    if (differing.length === 0) {
        clearTimeout(restoreSent.timer);
        restoreSent = null;
        BackupMessage('Settings restored.');
    } else if (final) {
        if (Object.keys(restoreSent.settings).some(k => hasOwn(pendingSettings, k))) {         // the settings did not reach the action yet (the connection was lost): wait for them
            restoreSent.timer = setTimeout(FinishRestore, RESTORE_CHECK_MS);
            BackupMessage('Waiting for Streamer.bot to take the settings. They are restored as soon as it answers.');
            return;
        }
        restoreSent = null;
        // When the action gave a reason for the save (status.saveNote), that reason is the one to read here
        const cause = pbStatus.saveNote || 'It limits some values, and it removes a rule that names a printer this setup does not have. The Streamer.bot log says more.';
        BackupMessage(`Printer Bot kept other values for: ${differing.join(', ')}. ${cause}`, 'error');
    }
}
function FinishRestore() { CheckRestore(true); }

////////////////////////
// BUTTONS AND FIELDS //
////////////////////////

$('sb-status-button').addEventListener('click', OpenConnectDialog);
$('sb-close-button').addEventListener('click', CloseConnectDialog);
$('sb-connect-button').addEventListener('click', Connect);
$('copy-import-button').addEventListener('click', (e) => CopyImportCode(e.currentTarget, $('import-result-setup')));
$('copy-import-outdated-button').addEventListener('click', (e) => CopyImportCode(e.currentTarget, $('import-result-outdated')));
$('copy-import-updates-button').addEventListener('click', (e) => CopyImportCode(e.currentTarget, $('import-result-updates')));
$('check-action-button').addEventListener('click', CheckAction);
// The dot in the header and Show the steps open the Updates card (when it is closed) and scroll it to the top of the page
const ShowUpdatesCard = () => { updatesBox.open = true; $('updates-card').scrollIntoView({ block: 'start' }); };
$('update-badge').addEventListener('click', ShowUpdatesCard);
$('show-updates-button').addEventListener('click', ShowUpdatesCard);
$('core-check-button').addEventListener('click', CheckCore);
$('core-update-button').addEventListener('click', UpdateCore);
$('core-reinstall-button').addEventListener('click', ReinstallCore);
$('core-reload-button').addEventListener('click', ReloadDock);
$('update-notice-reload').addEventListener('click', ReloadDock);
$('reload-dock-button').addEventListener('click', ReloadDock);
$('core-rollback-button').addEventListener('click', () => RollBack('previous'));
$('core-builtin-button').addEventListener('click', () => RollBack('builtin'));
$('legacy-printer-button').addEventListener('click', UseLegacyPrinter);
$('update-check-button').addEventListener('click', CheckForUpdates);
$('update-use-button').addEventListener('click', UseThisDock);
$('renderer-reset-button').addEventListener('click', ResetRenderer);
$('clear-avatars-button').addEventListener('click', ClearAvatars);
$('settings-save-button').addEventListener('click', SaveSettingsFile);
$('settings-restore-button').addEventListener('click', () => $('settings-file').click());
$('settings-file').addEventListener('change', (e) => { const file = e.currentTarget.files && e.currentTarget.files[0]; e.currentTarget.value = ''; OnSettingsFile(file); });
$('settings-apply-button').addEventListener('click', ApplyRestore);
$('settings-cancel-button').addEventListener('click', CancelRestore);
$('settings-text-show-button').addEventListener('click', ShowSettingsText);
$('settings-text-copy-button').addEventListener('click', CopySettingsText);
$('settings-text-check-button').addEventListener('click', () => PrepareRestore($('settings-text-in').value));
RenderPrereleaseNote();
$('mirror-note-dismiss').addEventListener('click', () => { store.set(MIRROR_KEY, '1'); $('mirror-note').hidden = true; });
$('test-print-button').addEventListener('click', TestPrint);
$('sample').addEventListener('change', RenderTestEditor);            // 3.0.4: the values of the chosen entry
$('test-event-reset-button').addEventListener('click', TestReset);
$('test-event-add-button').addEventListener('click', TestAddValue);

// Follow the rules in the Test card. The choice is kept in this browser (it is a way of working, not a setting of Printer Bot), and it starts off.
const TEST_RULES_KEY = 'pbTestFollowRules';
$('test-rules').checked = store.get(TEST_RULES_KEY) === '1';
$('test-rules').addEventListener('change', () => {
    store.set(TEST_RULES_KEY, $('test-rules').checked ? '1' : '0');
    PrintersTestRulesChanged();
});
$('preview-button').addEventListener('click', TogglePreview);
$('copy-folder-button').addEventListener('click', CopyFolder);
