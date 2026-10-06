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
const FRONTEND_VERSION = '2.4.0';

// The first Printer Bot version that can update itself. An older action has no updater, whatever it sends.
const LOADER_SINCE = '2.4.0';

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
let statusTimer = null, saveTimer = null, savedFlagTimer = null, awaitingSave = false;
let pendingSettings = {};     // edits made on screen, waiting for the 400 ms save timer
const inFlight = {};          // edits already sent to the action but not confirmed by a status yet: { id: { value, at } }
const IN_FLIGHT_MS = 4000;
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

// "2.2.0" -> [2, 2, 0], or null when it is not a version
function VersionParts(v) {
    const m = /^\s*v?(\d+(?:\.\d+){0,3})\s*$/.exec(str(v, 40));
    return m ? m[1].split('.').map(Number) : null;
}
function IsOlderVersion(a, b) {          // true when version a is older than version b (an unreadable a counts as older)
    const pa = VersionParts(a), pb = VersionParts(b);
    if (!pb) return false;
    if (!pa) return true;
    for (let i = 0; i < 4; i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x !== y) return x < y;
    }
    return false;
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
        minActionVersion: VersionParts(cfg.minActionVersion) ? str(cfg.minActionVersion, 40).trim() : '',
    };
})();

configPromise.then(config => {
    const domain = getComputedStyle(document.documentElement).getPropertyValue('--domain').trim();
    document.title = `${domain} • ${config.title}`;
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
    if (isConnected) {
        PersistConnection();
        statusSeen = false;
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

function Send(command, extra) {
    if (!actionId) return Promise.resolve();
    return sbClient.doAction({ id: actionId }, { pbCommand: command, ...(extra || {}) })
        .catch(err => console.error(`Printer Bot command "${command}" failed:`, err));
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
    return { ok: !!l.ok, ms: Math.max(0, Math.round(num(l.ms))), at: str(l.at, 60), source: str(l.source, 100), error: str(l.error), mode: str(l.mode, 20) };
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
    RenderOutdated(s);
    RenderDockOutdated(s);
    RenderUpdateRows(s);
    RenderUpdates();
    RenderFolder(s);

    if (awaitingSave) { awaitingSave = false; FlashSaved(); }
    if (previewOpen && s.hasPreview && s.last.at !== lastPreviewAt) Send('preview');
    OfferLegacyPrinter(s);
    FirstStatus(s);
    AskUpdater(s);
    if (firstOfConnection || s.version !== lastReportedVersion) ReportBackendVersion(s);
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
    if (s.edge.state === 'error') SetStatusLine('bad', `Can't start Edge: ${s.edge.message}`);
    else if (!printerOk) SetStatusLine('warn', 'No printer found. Install your receipt printer, or pick one below.');
    else if (!s.last.ok && s.last.error) SetStatusLine('bad', `Last print failed: ${s.last.error}`);
    else if (queueBad) SetStatusLine('warn', q.text || (q.state === 'stale' ? 'Receipts are waiting in the print queue.' : 'The print queue has a problem.'));
    else SetStatusLine('ok', 'Ready');

    let lastText = 'nothing yet';
    if (s.last.at) {
        const when = new Date(s.last.at);
        lastText = `${s.last.source}, ${s.last.ms} ms${isNaN(when.getTime()) ? '' : ', ' + when.toLocaleTimeString()}`;
    }

    const rows = [];
    rows.push(['Printer', png ? 'not needed (preview only)'
        : s.printer.name ? h('span', null, s.printer.name, s.printer.auto ? h('span', { class: 'muted' }, ' (auto-detected)') : null) : 'none found']);
    rows.push(['Output', modeName(mode)]);
    rows.push(['Last print', lastText]);
    if (s.printer.note) rows.push(['Note', s.printer.note]);
    if (!png && s.printer.name && q) {
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
    setCheck('hideLinks', st.hideLinks);

    // An action imported before a setting existed doesn't report it and would silently ignore it. Disable the control and say why.
    for (const id of SETTING_CONTROLS) {
        const supported = hasOwn(st, id);
        $(id).disabled = !supported;
        if (supported) $(id).removeAttribute('title');
        else $(id).title = 'The Printer Bot action is older than this dock. Import it again to use this setting.';
    }
    // Installing by itself needs program updates to be switched on in Advanced
    if (hasOwn(st, 'autoUpdateCore') && HostedUpdatesOff(s)) {
        $('autoUpdateCore').disabled = true;
        $('autoUpdateCore').title = HOSTED_OFF_TEXT;
    }
    RenderBitsPerInchExample();

    const skipped = $('skipped-free');
    skipped.hidden = !(s.skippedFree > 0);
    skipped.textContent = `Skipped by that limit: ${s.skippedFree}`;
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
}

function ApplyModeVisibility(mode) {
    document.querySelectorAll('[data-only]').forEach(el => { el.hidden = el.dataset.only !== mode; });
    $('printer').closest('.setting').hidden = mode === 'png';
}

function SameValue(a, b) {
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
    const missingControl = SETTING_CONTROLS.some(id => !hasOwn(s.settings, id));
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
    button.textContent = 'Checking…';
    // The check runs in the action and its answer arrives later as a status (see the Renderer rows). This timer just resets the button.
    setTimeout(() => { checkingUpdate = false; button.textContent = 'Check now'; if (pbStatus) RenderUpdateRows(pbStatus); }, 3000);
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
    button.textContent = 'Resetting…';
    setTimeout(() => { resettingRenderer = false; button.textContent = 'Reset to built-in renderer'; if (pbStatus) RenderUpdateRows(pbStatus); }, 2000);
    Send('resetRenderer');
}


/////////////
// UPDATES //
/////////////

// The Updates card shows the state of the action's own updater (the pb:'updater' message) and sends checkCore, updateCore and rollbackCore.
// An update is installed only after two clicks on the Update button, or by the action itself when the person switched on automatic installs.
// The updater sends fixed short codes for its errors, and this page turns each into a sentence.

const UPDATE_STATES = ['idle', 'checking', 'current', 'available', 'downloading', 'verifying', 'waiting', 'installing', 'installed', 'failed', 'paused', 'unavailable', 'reimport'];
const WORKING_STATES = ['downloading', 'verifying', 'waiting', 'installing'];      // an update is on its way: nothing else can be started
const HOSTED_OFF_TEXT = 'Turn on "Download updates" in Advanced first.';
const ARM_MS = 5000;                  // the first click on Update stays armed this long
const PAUSE_MS = 4000;                // a button that sent a command stays off this long, or until the updater answers

const UPDATE_ERRORS = {
    'no-source': 'Printer Bot does not know where to get updates yet. Open the dock from its web address and connect once.',
    'off': 'Updates are switched off in Advanced.',
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
        },
        can: { check: k.check === true, update: k.update === true, rollback: k.rollback === true },
    };
}

// An action from 2.4.0 on has an updater. It counts as having one as soon as it has sent its updater message, and before that by its version.
const ActionHasUpdater = (s) => pbUpdater !== null || !IsOlderVersion(s.version, LOADER_SINCE);
const HostedUpdatesOff = (s) => s.settings.allowHostedUpdates === false;
const RunningVersion = () => (pbUpdater && pbUpdater.core.version) || (pbStatus && pbStatus.version) || '';

// The version the Update button would install: the latest the updater verified, when it is newer than the running one. Otherwise ''.
function OfferedVersion() {
    const u = pbUpdater && pbUpdater.update;
    if (!u || !VersionParts(u.latest)) return '';
    return IsOlderVersion(RunningVersion(), u.latest) ? u.latest : '';
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
// the version of the offer it started from in the message, so it says "Switching versions…" in place of a version that is not the target.
// A page that has seen no calm state yet (it was opened in the middle of a switch) cannot tell an update from a rollback and says "Switching versions…" too.
function SwitchingText(latest) {
    const newer = !!VersionParts(latest) && idleVersion !== '' && !RollbackUnderWay() && IsOlderVersion(idleVersion, latest);
    return newer ? `Switching to ${latest}…` : 'Switching versions…';
}

function ResetUpdateArm() {
    updateArmed = false;
    updateArmedFor = '';
    clearTimeout(updateArmTimer);
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

// The whole card, from the last status and the last updater message. It is cheap and safe to redraw at any time.
function RenderUpdates() {
    if (!pbStatus) return;
    const s = pbStatus, up = pbUpdater;
    const hasUpdater = ActionHasUpdater(s);
    const running = RunningVersion();
    const offered = OfferedVersion();
    const state = up ? up.update.state : 'idle';
    const hostedOff = HostedUpdatesOff(s);
    const working = WORKING_STATES.includes(state);

    // what runs now
    const rows = [['Printer Bot', h('span', null, running || 'unknown', h('span', { class: 'muted' }, up ? ` (${CoreSourceText(up.core)})` : hasUpdater ? '' : ' (cannot update itself)'))]];
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
    if (!hasUpdater) { $('update-badge').hidden = true; return; }

    // the state line
    const u = up ? up.update : null;
    const target = u && u.latest ? u.latest : 'the update';
    // A newer version that the updater does not offer for installing (can.update is false) and that is on its list of rejected versions was set aside
    // after it failed to start on this PC. A version the person went back from is on that list too, and the updater still lets them install it.
    const setAside = !!u && offered !== '' && !up.can.update && u.rejected.includes(offered);
    let text = 'Waiting for the updater…', level = '', message = '', notes = false, progress = -1;
    if (u) switch (state) {
        case 'idle': text = 'Checking soon.'; break;
        case 'checking': text = 'Checking for updates…'; level = 'info'; break;
        case 'current':
            if (u.error === 'rejected' && offered) { text = `Update ${offered} was set aside.`; level = 'warn'; }
            else { text = 'Up to date.'; level = 'ok'; }
            break;
        case 'available': if (offered) { text = `Update available: ${offered}`; level = 'info'; notes = true; } else { text = 'Up to date.'; level = 'ok'; } break;
        case 'downloading': text = `Downloading ${target}…${u.progress > 0 ? ' ' + u.progress + '%' : ''}`; level = 'info'; notes = true; progress = u.progress; break;
        case 'verifying': text = `Checking the download of ${target}…`; level = 'info'; notes = true; break;
        case 'waiting': text = 'Waiting for a receipt to finish…'; level = 'warn'; notes = true; break;
        case 'installing': text = SwitchingText(u.latest); level = 'info'; notes = true; break;
        case 'installed': text = `Updated to ${up.core.version || target}.`; level = 'ok'; notes = true; break;
        case 'failed':
            if (droppedFrom) { text = 'Printer Bot went back to the built-in version.'; level = 'warn'; message = `Version ${droppedFrom} stopped working, so Printer Bot set it aside.`; }
            else { text = 'The update did not work.'; level = 'bad'; message = UpdateErrorText(u.error) + FailedTail(u, up.core, running) + (setAside ? ` Version ${offered} will not be tried again.` : ''); notes = !!offered; }
            break;
        case 'paused': text = 'The author has paused updates.'; level = 'warn'; break;
        case 'unavailable':
            // The updater records "off" when it asked while Download updates was off. Once the person has switched it on again, that line is out of date until the next message.
            if (u.error === 'off' && !hostedOff) { text = 'Checking soon.'; break; }
            text = 'Updates are not available.'; level = 'warn'; message = UpdateErrorText(u.error); break;
        case 'reimport': text = 'This Printer Bot needs a one-time re-import to update.'; level = 'warn'; break;
        default: text = 'The update state is not known.'; break;
    }
    // A refused command (an Update 60 seconds after a failure, for example) leaves the state as it is and sets an error. The reason shows in every state
    // that does not explain itself. The paused state and the re-import block say it already.
    // The error "off" is the one case that says nothing once Download updates is on again, and the card says "switched off" itself while it is off.
    if (u && u.error && u.error !== 'off' && !message && state !== 'paused' && state !== 'reimport') message = UpdateErrorText(u.error);
    if (hostedOff && !working) { text = 'Updates are switched off in Advanced.'; level = 'warn'; message = ''; notes = false; }
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
    check.textContent = checkingCore || state === 'checking' ? 'Checking…' : 'Check now';
    check.title = hostedOff ? HOSTED_OFF_TEXT : up && !up.can.check ? 'The updater cannot check right now.' : '';

    // The button is there only when the updater says it can install the offer (can.update). A version that was set aside gets no button.
    const showUpdate = !hostedOff && (state === 'available' || state === 'failed') && offered !== '' && !!up && up.can.update;
    if (updateArmed && (!showUpdate || updateArmedFor !== offered)) ResetUpdateArm();            // what was on screen when the first click came is gone
    const button = $('core-update-button');
    button.hidden = !showUpdate;
    button.disabled = updateSending;
    button.title = '';
    button.textContent = !showUpdate ? 'Update' : updateSending ? 'Starting…' : updateArmed ? 'Update now? Click again' : `Update to ${offered}`;
    button.classList.toggle('confirming', updateArmed);
    $('update-hint').hidden = !showUpdate;
    // The updater turned a click down because it tried an update a moment ago. This is a note under the button and leaves the reason of the failure alone.
    $('update-refused').textContent = showUpdate && u.refused === 'wait' ? REFUSED_WAIT_TEXT : '';
    $('update-refused').hidden = !$('update-refused').textContent;
    $('core-reload-button').hidden = state !== 'installed';
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
function UpdateCore() {
    const offered = OfferedVersion();
    if (!pbUpdater || !pbUpdater.can.update || !offered || updateSending || HostedUpdatesOff(pbStatus)) return;
    if (!['available', 'failed'].includes(pbUpdater.update.state)) return;
    if (!updateArmed || updateArmedFor !== offered) {
        ResetUpdateArm();
        updateArmed = true;
        updateArmedFor = offered;
        updateArmTimer = setTimeout(() => { ResetUpdateArm(); RenderUpdates(); }, ARM_MS);
        RenderUpdates();
        return;
    }
    ResetUpdateArm();
    updateSending = true;
    rollbackAskedAt = 0;                    // an update the person starts is not the rollback they asked for earlier
    setTimeout(() => { updateSending = false; RenderUpdates(); }, PAUSE_MS * 2);
    Send('updateCore', { expect: offered });
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
    'ignoreTestTriggers', 'keepDebugFiles', 'allowHostedUpdates', 'freePrintsPerMinute', 'hideLinks', 'autoUpdateCore'];

const MAX_INCHES_LIMIT = 40;               // the action clamps the maximum length to this many inches

SETTING_CONTROLS.forEach(id => {
    const el = $(id);
    el.addEventListener('change', () => {
        let value = el.type === 'checkbox' ? el.checked : el.value;
        if (id === 'paperWidthMm' || id === 'feedDots' || id === 'highRollerBits') value = parseInt(value, 10) || 0;
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
        else text = `At ${bits(perInch)} per inch: ${bits(low)} → up to ${inches(low)}, ${bits(high)} → up to ` +
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
    $('advanced-hint').textContent = parts.length ? ' · ' + parts.join(' · ') : '';
}
$('highRollerBitsPerInch').addEventListener('input', RenderBitsPerInchExample);
$('highRollerMaxInches').addEventListener('input', RenderBitsPerInchExample);
$('highRollerBits').addEventListener('input', RenderBitsPerInchExample);

function SaveSettings() {
    const patch = pendingSettings;
    pendingSettings = {};
    const at = Date.now();
    Object.keys(patch).forEach(id => { inFlight[id] = { value: patch[id], at }; });
    awaitingSave = true;
    Send('saveSettings', { settingsJson: JSON.stringify(patch) });
}

function FlashSaved() {
    $('saved-flag').hidden = false;
    $('advanced-saved').hidden = false;                       // the Settings header can be scrolled out of sight
    clearTimeout(savedFlagTimer);
    savedFlagTimer = setTimeout(() => { $('saved-flag').hidden = true; $('advanced-saved').hidden = true; }, 1800);
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
    // Edits are saved a moment after you stop typing. A test shouldn't beat them to the action, so it carries them with it.
    const unsaved = pendingSettings;
    clearTimeout(saveTimer);
    pendingSettings = {};
    const hasUnsaved = Object.keys(unsaved).length > 0;
    if (hasUnsaved) {
        const at = Date.now();
        Object.keys(unsaved).forEach(id => { inFlight[id] = { value: unsaved[id], at }; });
        awaitingSave = true;
        Send('saveSettings', { settingsJson: JSON.stringify(unsaved) });       // (an older action ignores the copy sent with the test)
    }
    Send('testPrint', { sample: $('sample').value, ...(hasUnsaved ? { settingsJson: JSON.stringify(unsaved) } : {}) });
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
    $('preview-caption').textContent = `${Math.round(num(p.width))}×${Math.round(num(p.height))}, exactly what the printer receives`;
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
            h('p', { class: 'hint import-compare' }, 'Compare it with the SHA-256 in import.sha256.txt from the download you got Printer Bot from (not with a copy from the same web host).'),
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
        const res = await fetch(new URL('../../import.txt', location.href), { cache: 'no-store', credentials: 'omit' });
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
        box.hash.textContent = `Could not load import.txt (${err.message}). Open import.txt on the web host and copy it by hand.`;
        button.textContent = 'Could not copy. Open import.txt and copy it by hand.';
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
$('update-badge').addEventListener('click', () => $('updates-card').scrollIntoView({ block: 'start' }));
$('core-check-button').addEventListener('click', CheckCore);
$('core-update-button').addEventListener('click', UpdateCore);
$('core-reload-button').addEventListener('click', ReloadDock);
$('reload-dock-button').addEventListener('click', ReloadDock);
$('core-rollback-button').addEventListener('click', () => RollBack('previous'));
$('core-builtin-button').addEventListener('click', () => RollBack('builtin'));
$('legacy-printer-button').addEventListener('click', UseLegacyPrinter);
$('update-check-button').addEventListener('click', CheckForUpdates);
$('update-use-button').addEventListener('click', UseThisDock);
$('renderer-reset-button').addEventListener('click', ResetRenderer);
$('test-print-button').addEventListener('click', TestPrint);
$('preview-button').addEventListener('click', TogglePreview);
$('copy-folder-button').addEventListener('click', CopyFolder);
