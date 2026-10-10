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
const FRONTEND_VERSION = '3.0.0-beta.2';

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
};
const MODE_NAME = { escpos: 'Thermal printer (ESC/POS)', windows: 'Windows printer driver', png: 'Preview only (no printer)' };
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
async function CheckAction() {
    let config;
    try { config = await configPromise; }
    catch (err) { return; }                       // the page already says why (see AddPageNotice above)
    actionId = config.actionId;

    let found = false;
    try {
        const response = await sbClient.getActions();
        found = response.actions.some(a => a.id === actionId);
        legacyActionsFound = response.actions.some(a => a.name === 'Printer Bot | Events' || a.name === 'Printer Bot | Print Routine');
    } catch (err) { console.error('Could not list actions:', err); }

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
function NormalizeStatus(d) {
    const p = isObj(d.printer) ? d.printer : {};
    const q = isObj(p.queue) ? p.queue : null;
    const e = isObj(d.edge) ? d.edge : {};
    const r = isObj(d.renderer) ? d.renderer : {};
    const u = isObj(d.updateSource) ? d.updateSource : null;
    const list = (a) => Array.isArray(a) ? a.slice(0, 200).map(x => str(x, 300)) : [];
    const queueOf = (x) => isObj(x) ? { state: str(x.state, 20), jobs: Math.max(0, Math.round(num(x.jobs))), oldestSec: Math.round(num(x.oldestSec)), text: str(x.text) } : null;
    // 3.0: what each printer resolved to. An action from before 3.0 sends none, and its one printer is printer 1.
    const printers = Array.isArray(d.printers) && d.printers.length ? d.printers.slice(0, RT_MAX_LIMITS.printers).map((x, i) => {
        x = isObj(x) ? x : {};
        return { slot: Math.round(num(x.slot)) || i + 1, name: str(x.name, 300), auto: x.auto === true, note: str(x.note), mode: str(x.mode, 20), queue: queueOf(x.queue) };
    }) : [{ slot: 1, name: str(p.name, 300), auto: p.auto === true, note: str(p.note), mode: isObj(d.settings) ? str(d.settings.mode, 20) : '', queue: queueOf(p.queue) }];
    const routing = isObj(d.routing) ? {
        maxPrinters: Math.round(num(d.routing.maxPrinters)), maxRules: Math.round(num(d.routing.maxRules)),
        maxConditions: Math.round(num(d.routing.maxConditions)), maxValueChars: Math.round(num(d.routing.maxValueChars)),
        settingsBytes: Math.max(0, Math.round(num(d.routing.settingsBytes))), settingsLimit: Math.max(0, Math.round(num(d.routing.settingsLimit))),      // 3.0.0-beta.2: how full the settings are
    } : null;
    return {
        version: d.version == null ? '' : str(d.version, 40),
        minDock: d.minDock == null ? '' : str(d.minDock, 40),         // the oldest dock page this action works well with (empty from an older action)
        settings: isObj(d.settings) ? d.settings : {},
        updateSource: u ? { set: u.set === true, host: str(u.host, 200) } : null,
        printer: {
            name: str(p.name, 300), auto: p.auto === true, note: str(p.note), installed: list(p.installed),
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
        settingsRestored: d.settingsRestored === 'mirror' ? 'mirror' : '',      // 3.0.0-beta.2: the settings came back from the backup copy at the start of this run
    };
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
    const signature = JSON.stringify([autoLabel, names, s.printer.installed]);
    if (signature !== printerSignature && select !== document.activeElement) {
        const chosen = select.value;                      // an edit that is still pending must survive the rebuild
        printerSignature = signature;
        select.replaceChildren(new Option(autoLabel, ''),
            ...names.map(n => new Option(n + (s.printer.installed.includes(n) ? '' : ' (not installed)'), n)));
        select.value = saved;
        if (Protected('printer')) select.value = chosen;
        if (select.selectedIndex < 0) select.value = saved;
    }
    else if (!skip('printer') && select.value !== saved) select.value = saved;
    const autoOption = select.options[0];
    if (autoOption && autoOption.value === '' && autoOption.text !== autoLabel) autoOption.text = autoLabel;

    setValue('paperWidthMm', num(st.paperWidthMm) >= 70 ? '80' : '58');
    setValue('mode', str(st.mode, 40));
    setValue('dither', str(st.dither, 40));
    setValue('cut', str(st.cut, 40));
    setValue('feedDots', num(st.feedDots));
    setValue('highRollerBits', num(st.highRollerBits));
    setValue('highRollerBitsPerInch', num(st.highRollerBitsPerInch) || 0);
    setValue('highRollerMaxInches', num(st.highRollerMaxInches) || 0);
    setValue('freePrintsPerMinute', num(st.freePrintsPerMinute));
    setCheck('ignoreTestTriggers', st.ignoreTestTriggers);
    setCheck('keepDebugFiles', st.keepDebugFiles);
    setCheck('allowHostedUpdates', st.allowHostedUpdates);
    setCheck('autoUpdateCore', st.autoUpdateCore);
    setCheck('prereleaseUpdates', st.prereleaseUpdates);
    setCheck('hideLinks', st.hideLinks);
    setCheck('hypeTrain', st.hypeTrain);

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

    const skipped = $('skipped-free');
    skipped.hidden = !(s.skippedFree > 0);
    skipped.textContent = `Skipped by that limit: ${s.skippedFree}`;
    RenderAvatarCache(s);
    RenderAdvancedHint();

    const mode = $('mode').value;
    ApplyModeVisibility(mode);
    $('mode-description').textContent = modeText(mode);

    const sample = $('sample');
    const samplesNow = JSON.stringify(s.samples);
    if (samplesNow !== sampleSignature) {
        sampleSignature = samplesNow;
        const keep = sample.value;
        sample.replaceChildren(...s.samples.map(n => new Option(n, n)));
        if (s.samples.includes(keep)) sample.value = keep;
    }
    PrintersRender(s);
}

function ApplyModeVisibility(mode) {
    document.querySelectorAll('[data-only]').forEach(el => { el.hidden = el.dataset.only !== mode; });
    $('printer').closest('.setting').hidden = mode === 'png';
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
    const missingControl = SETTING_CONTROLS.some(id => !hasOwn(s.settings, id)) || !hasOwn(s.settings, 'extraPrinters') || !hasOwn(s.settings, 'routing');
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
const UPDATED_BRIEF = 'Updated. Restart Streamer.bot, then reload the dock';
function SetUpdatesHint(text) { $('updates-hint').textContent = text; }

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
        case 'installed': text = `Updated to ${up.core.version || target}.`; brief = UPDATED_BRIEF; level = 'ok'; notes = true; break;
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
    $('core-reload-button').hidden = state !== 'installed';
    $('update-restart').hidden = state !== 'installed';                    // the program is new: Streamer.bot should restart first, then the dock reloads
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

const SETTING_CONTROLS = ['printer', 'paperWidthMm', 'mode', 'dither', 'cut', 'feedDots', 'highRollerBits', 'highRollerBitsPerInch', 'highRollerMaxInches',
    'ignoreTestTriggers', 'keepDebugFiles', 'allowHostedUpdates', 'freePrintsPerMinute', 'hideLinks', 'hypeTrain', 'autoUpdateCore', 'prereleaseUpdates'];

const MAX_INCHES_LIMIT = 40;               // the action clamps the maximum length to this many inches

SETTING_CONTROLS.forEach(id => {
    const el = $(id);
    el.addEventListener('change', () => {
        let value = el.type === 'checkbox' ? el.checked : el.value;
        if (id === 'paperWidthMm' || id === 'feedDots' || id === 'highRollerBits') value = parseInt(value, 10) || 0;
        if (id === 'feedDots' || id === 'highRollerBits') {
            if (value < 0) value = 0;                                         // blank / junk / negative = 0
            const maximum = id === 'feedDots' ? 400 : 1000000;
            if (value > maximum) value = maximum;                             // the action clamps the same way
            el.value = value;                                                 // show what will actually be saved
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
        pendingSettings[id] = value;
        saveFailedNote = '';                                                 // an edit starts a new try
        if (id === 'hypeTrain') RenderAdvancedHint();
        // keep the visible rows in step right away. The confirmed values come back with the next status
        if (id === 'mode') { $('mode-description').textContent = modeText(value); ApplyModeVisibility(value); }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(SaveSettings, 400);
    });
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

// The maximum length in the box: a number of inches from 0.01 to 40, or 0 when the box is empty, junk or off (then the built-in limit applies)
function MaxInchesSetting() {
    const v = parseFloat($('highRollerMaxInches').value);
    return v > 0 && isFinite(v) ? Math.min(v, MAX_INCHES_LIMIT) : 0;
}

// What the bits-per-inch number means, in the user's own numbers (and the High Roller threshold they have set).
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
    if (!(perInch > 0) && !(cap > 0)) text = 'Off: High Roller messages print in full.';
    else if (threshold <= 0) text = 'High Roller (bits) is 0, so no message is a High Roller and this has no effect.';
    else if (!(perInch > 0)) text = `No bits per inch limit. A High Roller message prints up to ${ceiling}, then fades out.`;
    else {
        const low = threshold, high = threshold * 4;
        if (inches(low) === null) text = `At ${bits(perInch)} per inch, even ${bits(low)} reaches ${ceiling}, ${ceilingName}.`;
        else text = `At ${bits(perInch)} per inch: ${bits(low)} \u2192 up to ${inches(low)}, ${bits(high)} \u2192 up to ` +
            (inches(high) === null ? `${ceiling} (${ceilingName}).` : `${inches(high)}.`);
    }
    $('bits-per-inch-example').textContent = text;
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
    $('advanced-hint').textContent = parts.length ? ' \u00B7 ' + parts.join(' \u00B7 ') : '';
}
$('highRollerBitsPerInch').addEventListener('input', RenderBitsPerInchExample);
$('highRollerMaxInches').addEventListener('input', RenderBitsPerInchExample);
$('highRollerBits').addEventListener('input', RenderBitsPerInchExample);

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
        if (hasOwn(s.settings, id) && SameValue(s.settings[id], awaitingSave[id].value)) { delete awaitingSave[id]; confirmed = true; }
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
    clearTimeout(savedFlagTimer);
    savedFlagTimer = setTimeout(() => { $('saved-flag').hidden = true; $('advanced-saved').hidden = true; $('updates-saved').hidden = true; }, 1800);
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
    const button = $('test-print-button');
    button.disabled = true;
    setTimeout(() => { button.disabled = false; }, 1500);
    // Edits are saved a moment after you stop typing. A test shouldn't beat them to the action, so it carries them with it. An edit that was held back because the
    // action could not be reached is among them, so a test never prints with a setting that the dock does not show.
    const unsaved = { ...pendingSettings };
    const hasUnsaved = Object.keys(unsaved).length > 0;
    if (hasUnsaved) SaveSettings();             // the same save as any other, with the same handling of a failure (an older action ignores the copy sent with the test)
    const printers = PrintersTestTarget();              // 3.0: "all" or the number of one printer, as text. Nothing with one printer
    Send('testPrint', { sample: $('sample').value, ...(printers ? { printers } : {}), ...(hasUnsaved ? { settingsJson: JSON.stringify(unsaved) } : {}) });
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
const BACKUP_KEYS = ['printer', 'paperWidthMm', 'mode', 'dither', 'cut', 'feedDots', 'highRollerBits', 'highRollerBitsPerInch', 'highRollerMaxInches',
    'ignoreTestTriggers', 'keepDebugFiles', 'freePrintsPerMinute', 'hideLinks', 'hypeTrain', 'extraPrinters', 'routing'];
const BACKUP_TYPES = {
    printer: 'string', mode: 'string', dither: 'string', cut: 'string',
    paperWidthMm: 'number', feedDots: 'number', highRollerBits: 'number', highRollerBitsPerInch: 'number', highRollerMaxInches: 'number', freePrintsPerMinute: 'number',
    ignoreTestTriggers: 'boolean', keepDebugFiles: 'boolean', hideLinks: 'boolean', hypeTrain: 'boolean',
    extraPrinters: 'array', routing: 'object',
};
const BACKUP_MAX_FILE = 200000;          // the most that is read from a file or a pasted text
const BACKUP_MAX_SETTINGS = 60000;       // the action takes at most 65,536 characters in one saveSettings. The status says its own limit (settingsLimit), which is used when it is there
const BackupSettingsLimit = () => pbStatus && pbStatus.routing && pbStatus.routing.settingsLimit > 0 ? pbStatus.routing.settingsLimit : BACKUP_MAX_SETTINGS;
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

// One click: the browser gets the file. A dock that cannot download files (some OBS docks) has the text box below.
function SaveSettingsFile() {
    if (!pbStatus) { BackupMessage('Printer Bot has not answered yet. Connect to Streamer.bot first.', 'error'); return; }
    const text = BackupFileText();
    const name = BackupFileName();
    try {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = h('a', { href: url, download: name });
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        BackupMessage(`Saved ${name} in the downloads of your browser. If no file appears, this dock cannot save files. Use the text box below instead.`);
    } catch (err) {
        console.warn('Could not save the settings file:', err);
        BackupMessage('This dock could not save a file. Use the text box below instead.', 'error');
    }
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
    const settings = {}, skipped = [], wrong = [];
    for (const key of Object.keys(doc.settings)) {
        if (!BACKUP_KEYS.includes(key)) { skipped.push(str(key, 40)); continue; }
        if (TypeOfValue(doc.settings[key]) !== BACKUP_TYPES[key]) { wrong.push(key); continue; }
        settings[key] = doc.settings[key];
    }
    if (wrong.length) { BackupMessage(`The file cannot be used. These entries have the wrong kind of value: ${wrong.join(', ')}.`, 'error'); return; }
    if (Object.keys(settings).length === 0) { BackupMessage('The file holds no settings this dock knows.', 'error'); return; }
    if (JSON.stringify(settings).length > BackupSettingsLimit()) { BackupMessage('The settings in the file are larger than Printer Bot accepts.', 'error'); return; }

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
$('preview-button').addEventListener('click', TogglePreview);
$('copy-folder-button').addEventListener('click', CopyFolder);
