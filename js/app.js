// ============================================================================
// Printer Bot dock: the control panel
//
// Streamer.bot builds and prints the receipts. This page:
//   - connects to Streamer.bot's WebSocket server,
//   - checks that the "Printer Bot" action is imported (and helps import it),
//   - shows status, edits settings, runs a test print and previews the last receipt.
//
// It talks to the action with   doAction(action, { pbCommand: 'status' | 'saveSettings' | ... })
// and the action answers with a broadcast   { pb: 'status' | 'preview', ... }
//
// Rules this file follows:
//   - Nothing from a status message goes into the page as HTML. Every value is set with textContent
//     (the h() helper below), so a forged message can only show text.
//   - index.html has no inline handlers. Every listener is added here, which lets the page carry a strict CSP.
//   - Browser storage may be blocked (OBS profiles, privacy modes), so every access is in try/catch with an in-memory fallback.
// ============================================================================

const urlParams = new URLSearchParams(window.location.search);

const $ = (id) => document.getElementById(id);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const str = (v, max = 1000) => { const s = v == null ? '' : String(v); return s.length > max ? s.slice(0, max) : s; };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

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
    const res = await fetch(configName, { credentials: 'omit', cache: 'no-cache' });
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

let sbClientListeners;

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
        // Listeners get cleared when re-connecting, so copy them back in
        if (sbClientListeners) sbClient.listeners = sbClientListeners;
    },
    onDisconnect: () => SetConnectionState(false),
    onError: (err) => SetErrorMessage(err),
});

sbClient.on('General.Custom', (response) => HandleBroadcast(response.data));

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

        $('sb-connect-dialog').style.display = 'none';
        $('blur-layer').style.display = 'none';
        $('sb-error-label').style.display = 'none';
        $('sb-status-icon').src = 'assets/icons/connected.svg';
        $('sb-status-button').title = `Connected to ${str(sbClient.info && sbClient.info.name, 80)} (${str(sbClient.info && sbClient.info.version, 40)})`;

        CheckAction();
    }
    else {
        $('sb-connect-dialog').style.display = 'flex';
        $('blur-layer').style.display = 'block';
        $('sb-status-icon').src = 'assets/icons/disconnected.svg';
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
    sbClientListeners = sbClient.listeners;
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
    pbStatus = s;
    statusSeen = true;
    clearTimeout(statusTimer);
    $('main').hidden = false;
    $('setup-card').hidden = true;

    RenderSummary(s);
    FillSettings(s);
    RenderOutdated(s);
    RenderUpdateRows(s);
    RenderFolder(s);

    if (awaitingSave) { awaitingSave = false; FlashSaved(); }
    if (previewOpen && s.hasPreview && s.last.at !== lastPreviewAt) Send('preview');
    OfferLegacyPrinter(s);
    FirstStatus(s);
}

// The first status after a connect. If the action has no update source yet, this dock's folder becomes it (once). If the source
// is already this dock, the same address is sent again and the action treats that as a request to look for an update, nothing more.
// It first reads a 150-byte version.json, and a downloaded renderer is used only if the author signed it. This is how a renderer
// on the dock's web host is picked up the next time the dock connects. A different source is shown but never changed without a click.
function FirstStatus(s) {
    if (sourceConfigureDone || !actionId) return;           // (no action id yet: this status is someone else's broadcast, ours follows)
    sourceConfigureDone = true;
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
    setValue('freePrintsPerMinute', num(st.freePrintsPerMinute));
    setCheck('ignoreTestTriggers', st.ignoreTestTriggers);
    setCheck('keepDebugFiles', st.keepDebugFiles);
    setCheck('allowHostedUpdates', st.allowHostedUpdates);
    setCheck('hideLinks', st.hideLinks);

    // An action imported before a setting existed doesn't report it and would silently ignore it. Disable the control and say why.
    for (const id of SETTING_CONTROLS) {
        const supported = hasOwn(st, id);
        $(id).disabled = !supported;
        if (supported) $(id).removeAttribute('title');
        else $(id).title = 'The Printer Bot action is older than this dock. Import it again to use this setting.';
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
function RenderOutdated(s) {
    const versionOld = !s.version || IsOlderVersion(s.version, minActionVersion);
    const missingControl = SETTING_CONTROLS.some(id => !hasOwn(s.settings, id));
    $('action-outdated').hidden = !(versionOld || missingControl);
    RenderAdvancedHint();
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

function RenderUpdateRows(s) {
    const u = s.updateSource;
    const supported = !!u;                           // an action from before this feature sends no updateSource
    const here = !!u && u.set && u.host === location.host;
    const other = !!u && u.set && !here;
    let text;
    if (!supported) text = 'unknown (the Printer Bot action is older than this dock)';
    else if (!u.set) text = 'not set yet';
    else if (here) text = 'this dock';
    else text = `another address: ${u.host}`;
    $('update-source-state').textContent = 'Updates come from: ' + text;

    const check = $('update-check-button'), use = $('update-use-button');
    check.disabled = !supported || !FOLDER_URL || other || checkingUpdate;
    check.title = !supported ? 'The Printer Bot action is older than this dock. Import it again to use this.'
        : !FOLDER_URL ? 'Open the dock from a web address to use this.'
            : other ? 'Updates come from another address. Press "Use this dock" first.' : '';
    use.hidden = !other;
    use.disabled = !FOLDER_URL;
    if (!other && useDockArmed) DisarmUseDock();

    $('renderer-detail').replaceChildren(RendererSummary(s.renderer));
    const reset = $('renderer-reset-button');
    reset.disabled = !supported || resettingRenderer;
    reset.title = supported ? '' : 'The Printer Bot action is older than this dock. Import it again to use this.';
}

function CheckForUpdates() {
    if (!FOLDER_URL || checkingUpdate) return;
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
    if (!FOLDER_URL) return;
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


//////////////
// SETTINGS //
//////////////

const SETTING_CONTROLS = ['printer', 'paperWidthMm', 'mode', 'dither', 'cut', 'feedDots', 'highRollerBits', 'highRollerBitsPerInch',
    'ignoreTestTriggers', 'keepDebugFiles', 'allowHostedUpdates', 'freePrintsPerMinute', 'hideLinks'];

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

// What the bits-per-inch number means, in the user's own numbers (and the High Roller threshold they have set).
// The renderer never prints a message longer than its 1600 px ceiling, which is 1600 / 96 = 16.7 inches.
const MAX_MESSAGE_INCHES = 1600 / 96;
function RenderBitsPerInchExample() {
    const perInch = parseFloat($('highRollerBitsPerInch').value);
    const threshold = parseInt($('highRollerBits').value, 10) || 0;
    const round = (v, places) => Math.round(v * 10 ** places) / 10 ** places;
    const NB = '\u00A0';                                                      // keeps "2.5 in" and "100 bits" from splitting across lines
    const bits = (n) => `${n}${NB}${n === 1 ? 'bit' : 'bits'}`;
    const ceiling = `${round(MAX_MESSAGE_INCHES, 1)}${NB}in`;
    // inches a cheer of n bits may print: null when that is past the ceiling
    const inches = (n) => { const v = n / perInch; return v > MAX_MESSAGE_INCHES ? null : v < 0.01 ? `<${NB}0.01${NB}in` : `${round(v, 2)}${NB}in`; };
    let text;
    if (!(perInch > 0)) text = 'Off: High Roller messages print in full.';
    else if (threshold <= 0) text = 'High Roller (bits) is 0, so no message is a High Roller and this has no effect.';
    else {
        const low = threshold, high = threshold * 4;
        if (inches(low) === null) text = `At ${bits(perInch)} per inch, even ${bits(low)} reaches ${ceiling}, the longest any message prints.`;
        else text = `At ${bits(perInch)} per inch: ${bits(low)} → up to ${inches(low)}, ${bits(high)} → up to ` +
            (inches(high) === null ? `${ceiling} (the longest any message prints).` : `${inches(high)}.`);
    }
    $('bits-per-inch-example').textContent = text;
    RenderAdvancedHint();
}

// Visible while Advanced is collapsed: what needs attention in there
function RenderAdvancedHint() {
    const parts = [];
    const perInch = parseFloat($('highRollerBitsPerInch').value);
    if ($('highRollerBitsPerInch').disabled || !$('action-outdated').hidden) parts.push('update needed');
    else if (perInch > 0) parts.push(`limit ${perInch} bits/in`);
    if (pbStatus && pbStatus.skippedFree > 0) parts.push(`${pbStatus.skippedFree} skipped`);
    $('advanced-hint').textContent = parts.length ? ' · ' + parts.join(' · ') : '';
}
$('highRollerBitsPerInch').addEventListener('input', RenderBitsPerInchExample);
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
        $('preview-caption').textContent = 'No receipt yet. Click Test print.';
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
        const res = await fetch('import.txt', { cache: 'no-store', credentials: 'omit' });
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
$('check-action-button').addEventListener('click', CheckAction);
$('legacy-printer-button').addEventListener('click', UseLegacyPrinter);
$('update-check-button').addEventListener('click', CheckForUpdates);
$('update-use-button').addEventListener('click', UseThisDock);
$('renderer-reset-button').addEventListener('click', ResetRenderer);
$('test-print-button').addEventListener('click', TestPrint);
$('preview-button').addEventListener('click', TogglePreview);
$('copy-folder-button').addEventListener('click', CopyFolder);
