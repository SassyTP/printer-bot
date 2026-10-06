// ============================================================================
// Printer Bot router
//
// This page is the address that goes into OBS. It draws no dock of its own. It finds out which version of the Printer Bot action
// runs in Streamer.bot, picks the dock page that goes with that version, and shows it in one full-window frame.
// That way an update to the action never breaks a dock that was not updated with it.
//
// Steps on every load:
//   1. Fetch versions.json, the list of dock pages. It is fetched fresh every time.
//   2. Open one connection to Streamer.bot, ask for the action's status, read its version, and close the connection again.
//   3. Pick the newest dock page that is not newer than the action (see PickFrontend).
//   4. Show that page in a frame at   <page>?b=<build>   so a changed dock page is always a new address.
//
// Two more jobs since router 2:
//   - A banner above the frame for an action that cannot update itself (it has no loader, see versions.json "core"). Show how swaps the frame
//     to the newest dock page, which explains the one-time re-import. Hide keeps the banner away until versions.json names a later version.
//   - The dock reports the backend version again when it changes (after a program update). That can swap the frame to the matching dock page.
//
// Rules this file follows:
//   - Everything from Streamer.bot and from versions.json is untrusted. Versions are cut to 40 characters and must be 1 to 4 numbers
//     separated by dots. Page names must match a strict pattern, and anything else in the list is ignored.
//   - The only thing sent to Streamer.bot is the one status command the dock sends on every connect anyway.
//   - index.html has no inline script, style or handler, so the page can carry a strict CSP. Every element is made here or in index.html.
//     The one size this file sets is a CSS variable (the banner height), which the CSP allows because it goes through the style object.
//   - Browser storage may be blocked (OBS profiles, privacy modes), so every access is in try/catch with an in-memory fallback.
// ============================================================================

'use strict';

// The number of this router. A larger "router" number in versions.json makes this page reload itself once at ./?r=<number>,
// which is a new address, so an old cached index.html and router.js are replaced. The build tool keeps the two numbers in step.
const ROUTER_BUILD = 2;

const MANIFEST_TIMEOUT_MS = 8000;      // fetching versions.json
const CONNECT_TIMEOUT_MS = 3000;       // connecting to Streamer.bot, up to and including its greeting
const ACTIONS_TIMEOUT_MS = 4000;       // the list of actions
const STATUS_TIMEOUT_MS = 4000;        // the status broadcast after the status command
const CLOSE_TIMEOUT_MS = 1500;         // closing the probe connection
const RETRY_MS = 5000;                 // a failed versions.json is tried again by itself after this long
const REVEAL_MS = 8000;                // a frame that has its page but is still loading files is shown anyway after this long
const LOAD_LIMIT_MS = 20000;           // a frame that has no page of its own after this long is given up on (the host never answered)
const REVEAL_POLL_MS = 1000;           // how often a frame that still has no page is looked at again
const REMEMBER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;   // a remembered backend version older than this counts as unknown
const REMEMBER_FUTURE_MS = 60 * 1000;                  // a time stamp this far ahead of the clock cannot be trusted either

// Two separate limits on swapping the frame because a dock page reported another backend version.
//   MAX_SWITCHES is the loop guard. It counts the swaps that follow the FIRST report of a dock page that was just loaded (the router chose
//   from a remembered version, or two pages disagree about which one fits). Two per page load, as in router 1.
//   MAX_UPDATE_SWITCHES counts the swaps that follow a LATER report of a dock page that was already open. That happens when the version of the
//   action changes while the dock stays open: a program update or a rollback. Each of those needs a button press and a real change of version,
//   and the action allows only a few updates per hour, so a budget of 6 is safe.
//   A swap of the second kind loads a new page, and that page's own first report counts against MAX_SWITCHES. A loop of first reports ends
//   after 2 swaps and a loop of later reports after 6.
const MAX_SWITCHES = 2;
const MAX_UPDATE_SWITCHES = 6;
const MAX_MANIFEST_BYTES = 65536;
const MAX_FRONTENDS = 50;

const FRAME_NAME = 'printer-bot-dock';
const REMEMBER_KEY = 'pbBackendVersion';       // the last backend version seen (localStorage)
const REMEMBER_AT_KEY = 'pbBackendVersionAt';  // when it was seen, in milliseconds (localStorage)
const UPDATE_KEY = 'pbRouterUpdate';           // the router number a self-update was tried for (sessionStorage)
const BANNER_KEY = 'pbUpdateBanner';           // the selfUpdateSince version the person hid the banner for (localStorage)

// Shown when no dock page can be put in the frame. A browser gives the router no way to tell a host that forbids framing
// from any other failed load, because it replaces the page with its own error page that this page may not read. So one text covers all causes.
const FRAME_FAILED = 'The dock page did not load. The web host may forbid framing it (X-Frame-Options or frame-ancestors). '
    + 'Dock pages are shown in a frame of the same site, so the host has to allow that.';
const DROPPED_PARAMS = new Set(['b', 't', 'r']);   // query parameters of this page that are not passed on to the dock

const $ = (id) => document.getElementById(id);
// Adds a listener to the element with this id. A page that is missing the element is skipped. A browser or a web host that still serves an
// index.html from before the banner existed runs this script too, and that page has no banner buttons.
const on = (id, event, fn) => { const el = $(id); if (el) el.addEventListener(event, fn); };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => { const s = v == null ? '' : String(v); return s.length > max ? s.slice(0, max) : s; };
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const messageOf = (err) => str(err && err.message ? err.message : err, 120);

// Where versions.json and the dock pages live: the folder of this page
const BASE = new URL('./', location.href);


/////////////
// STORAGE //
/////////////

function MakeStore(area) {
    const memory = new Map();
    return {
        get(key) {
            if (memory.has(key)) return memory.get(key);
            try { return area().getItem(key); } catch (e) { return null; }
        },
        set(key, value) {
            value = String(value);
            try { area().setItem(key, value); memory.delete(key); } catch (e) { memory.set(key, value); }
        },
        remove(key) {
            memory.delete(key);
            try { area().removeItem(key); } catch (e) { }
        },
    };
}
const local = MakeStore(() => window.localStorage);
const session = MakeStore(() => window.sessionStorage);

// The backend version the router saw last, with the time it saw it. The time matters because the 2.2.1 dock page cannot report a newer action.
// A remembered 2.2.1 would otherwise stay in force for as long as the probe keeps failing (a password that is not stored, Streamer.bot started after OBS).
function RememberVersion(version) {
    local.set(REMEMBER_KEY, version);
    local.set(REMEMBER_AT_KEY, String(Date.now()));
}

function ForgetVersion() {
    local.remove(REMEMBER_KEY);
    local.remove(REMEMBER_AT_KEY);
}

// Returns { version, expired }. version is the remembered version, or null when there is none or it is too old to trust.
// expired is the old version in that last case, so the log line can name it. A version with no readable time stamp (storage from before
// the stamp existed) counts as fresh. Past the age limit it counts as unknown, so the latest dock page shows, reads the real version
// from the action and the router swaps down when the action really is older. A stamp ahead of the clock means the clock moved, so it counts as old too.
function ReadRemembered() {
    const version = local.get(REMEMBER_KEY);
    if (version === null) return { version: null, expired: null };
    const at = local.get(REMEMBER_AT_KEY);
    if (at === null || !/^\d{1,16}$/.test(at)) return { version, expired: null };
    const age = Date.now() - Number(at);
    if (age > REMEMBER_MAX_AGE_MS || age < -REMEMBER_FUTURE_MS) return { version: null, expired: version };
    return { version, expired: null };
}


//////////////
// VERSIONS //
//////////////

// "2.3.0" gives [2, 3, 0]. Anything that is not 1 to 4 numbers separated by dots gives null.
const VERSION_RX = /^\d{1,9}(?:\.\d{1,9}){0,3}$/;
function ParseVersion(v) {
    if (typeof v !== 'string') return null;
    const s = str(v, 40).trim();
    return VERSION_RX.test(s) ? s.split('.').map(Number) : null;
}

function CompareParts(a, b) {                // -1, 0 or 1
    for (let i = 0; i < 4; i++) {
        const x = a[i] || 0, y = b[i] || 0;
        if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
}


//////////////
// MANIFEST //
//////////////

const PAGE_RX = /^[A-Za-z0-9._/-]+\.html$/;
const BUILD_RX = /^[0-9a-f]{12}$/;
const ACTION_RX = /^[0-9A-Za-z-]{8,64}$/;

function ValidPage(page) {
    return typeof page === 'string' && page.length <= 200 && PAGE_RX.test(page)
        && !page.includes('..') && !page.includes('//') && !page.startsWith('/');
}

// The "core" block of versions.json: a hint about program updates. selfUpdateSince is the first Printer Bot version that can update itself
// and latest is the newest published one. The block needs a selfUpdateSince that reads as a version, otherwise it is left out. A latest that
// does not read as a version becomes ''. The hint is unsigned, so the router uses it for the banner only and it never enables anything.
function NormalizeCore(raw) {
    if (!isObj(raw) || typeof raw.selfUpdateSince !== 'string' || !ParseVersion(raw.selfUpdateSince)) return null;
    return {
        selfUpdateSince: str(raw.selfUpdateSince, 40).trim(),
        latest: typeof raw.latest === 'string' && ParseVersion(raw.latest) ? str(raw.latest, 40).trim() : '',
    };
}

// Reduces the content of versions.json to what the router uses, or null when it has no list of dock pages at all.
// Entries that break a rule are left out. The frontends come back oldest first. Giving the result to this function again changes nothing.
function NormalizeManifest(raw) {
    if (!isObj(raw) || !Array.isArray(raw.frontends)) return null;
    const frontends = [];
    for (const e of raw.frontends.slice(0, MAX_FRONTENDS)) {
        if (!isObj(e)) continue;
        const parts = ParseVersion(e.version);
        if (!parts || !ValidPage(e.page) || typeof e.build !== 'string' || !BUILD_RX.test(e.build)) continue;
        if (frontends.some(f => CompareParts(ParseVersion(f.version), parts) === 0)) continue;       // the first entry for a version wins
        frontends.push({ version: str(e.version, 40).trim(), page: e.page, build: e.build });
    }
    frontends.sort((a, b) => CompareParts(ParseVersion(a.version), ParseVersion(b.version)));
    return {
        router: Number.isInteger(raw.router) && raw.router >= 0 ? raw.router : 0,
        actionId: typeof raw.actionId === 'string' && ACTION_RX.test(raw.actionId) ? raw.actionId : '',
        latest: typeof raw.latest === 'string' && ParseVersion(raw.latest) ? raw.latest.trim() : '',
        core: NormalizeCore(raw.core),
        frontends,
    };
}

// Does an action of this version get the banner? It needs a valid core block, a version that reads as one and sits below selfUpdateSince, and no sign
// of a loader (a version below selfUpdateSince has none by definition, and an action that sent pb:'updater' has one whatever its version says).
// Returns { since, latest } for the banner text, or null.
function NeedsBanner(manifest, backendVersion, hasLoader) {
    const m = NormalizeManifest(manifest);
    if (!m || !m.core || hasLoader === true) return null;
    const have = ParseVersion(backendVersion), since = ParseVersion(m.core.selfUpdateSince);
    if (!have || !since || CompareParts(have, since) >= 0) return null;
    return { since: m.core.selfUpdateSince, latest: m.core.latest };
}

// Which dock page serves which action:
//   - The newest dock page whose version is not above the backend version.
//   - A backend version that is missing, unreadable or below every dock page gets the oldest dock page (the floor).
//   - null or undefined means nothing is known about the action (not imported yet, no Streamer.bot yet). That gets "latest".
// Returns one of the manifest's frontends ({ version, page, build }), or null when the manifest has none that is usable.
function PickFrontend(manifest, backendVersion) {
    const m = NormalizeManifest(manifest);
    if (!m || m.frontends.length === 0) return null;
    const list = m.frontends;
    if (backendVersion === null || backendVersion === undefined) {
        const latest = ParseVersion(m.latest);
        return (latest && list.find(f => CompareParts(ParseVersion(f.version), latest) === 0)) || list[list.length - 1];
    }
    const want = ParseVersion(backendVersion);
    if (!want) return list[0];
    let best = list[0];
    for (const f of list) if (CompareParts(ParseVersion(f.version), want) <= 0) best = f;
    return best;
}

// Returns { manifest, router }. manifest is null when the file has no list of dock pages. router is the router number the file asks for (0 when it names none).
// The number is read apart from the list, so a router that cannot read a newer file format can still update itself.
async function LoadManifest() {
    const url = new URL('versions.json', BASE);
    url.searchParams.set('t', String(Date.now()));
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), MANIFEST_TIMEOUT_MS);
    try {
        let res;
        try { res = await fetch(url.href, { cache: 'no-store', credentials: 'omit', signal: abort.signal }); }
        catch (e) { throw new Error(abort.signal.aborted ? 'it took too long' : 'the request failed'); }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let text;
        try { text = await res.text(); } catch (e) { throw new Error('it could not be read'); }
        if (text.length > MAX_MANIFEST_BYTES) throw new Error('it is far larger than a real one');
        let raw;
        try { raw = JSON.parse(text); } catch (e) { throw new Error('it is not valid JSON'); }
        return { manifest: NormalizeManifest(raw), router: isObj(raw) && Number.isInteger(raw.router) && raw.router >= 0 ? raw.router : 0 };
    }
    finally { clearTimeout(timer); }
}

// A versions.json with a higher router number than this file means this router is old (an old cached copy).
// It reloads once at a new address. The attempt is also written into the address (?r=) and into sessionStorage, so it can never loop.
// Returns true when the page is on its way elsewhere.
function MaybeSelfUpdate(routerNumber) {
    if (!(routerNumber > ROUTER_BUILD)) return false;
    const want = String(routerNumber);
    const own = new URLSearchParams(location.search);
    if (own.get('r') === want || session.get(UPDATE_KEY) === want) {
        console.info(`[Printer Bot router] versions.json asks for router ${want} and this is router ${ROUTER_BUILD}. A reload was already tried, so it stays on this one.`);
        return false;
    }
    session.set(UPDATE_KEY, want);
    const next = new URL('./', location.href);
    for (const [key, value] of own) if (!DROPPED_PARAMS.has(key)) next.searchParams.append(key, value);
    next.searchParams.set('r', want);
    console.info(`[Printer Bot router] Router ${ROUTER_BUILD} is older than router ${want}. Reloading once at ${next.pathname}${next.search}`);
    location.replace(next.href);
    return true;
}


///////////////////////
// ASKING STREAMER.BOT //
///////////////////////

const HOST_RX = /^[A-Za-z0-9._\-\[\]:]{1,253}$/;

// The connection the dock last used. Bad values fall back to the defaults, so a damaged setting cannot build a strange address.
function ReadConnection() {
    let host = str(local.get('sbServerAddress'), 253).trim();
    if (!HOST_RX.test(host)) host = '127.0.0.1';
    let port = str(local.get('sbServerPort'), 5).trim();
    const n = Number(port);
    if (!/^\d{1,5}$/.test(port) || n < 1 || n > 65535) port = '8080';
    return { host, port, password: str(local.get('sbServerPassword'), 200) };
}

// One connection, one status command, then it closes. The answer is one of
//   { kind: 'version', version, updater }   the status arrived (version is '' when the status has none).
//                                           updater is true when the action also sent pb:'updater' until then, which only an action with a loader does.
//   { kind: 'no-action' }                   Streamer.bot answered and the Printer Bot action is not in its list
//   { kind: 'failed', why }                 no connection, wrong password, no answer in time
// The probe does not wait for a pb:'updater' message that comes after the status. A version below selfUpdateSince has no loader anyway.
// The loader of 2.4.0 sends pb:'updater' after its status, so updater is false in practice. The field and its banner rule stay for a loader that sends it first.
function ProbeBackend(actionId) {
    return new Promise((resolve) => {
        if (!actionId) { resolve({ kind: 'failed', why: 'versions.json names no action' }); return; }
        if (typeof StreamerbotClient !== 'function') { resolve({ kind: 'failed', why: 'the Streamer.bot client did not load' }); return; }
        let client = null, settled = false, timer = null, waitingForStatus = false, sawUpdater = false;

        const finish = async (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (client) {
                try { await Promise.race([client.disconnect(), sleep(CLOSE_TIMEOUT_MS)]); } catch (e) { }
            }
            resolve(result);
        };
        const fail = (why) => finish({ kind: 'failed', why: str(why, 120) });
        const wait = (ms, why) => { clearTimeout(timer); timer = setTimeout(() => fail(why), ms); };

        const onStatus = (response) => {
            const data = response && response.data;
            if (!isObj(data)) return;
            if (data.pb === 'updater') { sawUpdater = true; return; }
            if (!waitingForStatus || data.pb !== 'status') return;
            finish({ kind: 'version', version: typeof data.version === 'string' ? str(data.version, 40) : '', updater: sawUpdater });
        };

        const ask = async () => {
            if (settled) return;
            await client.on('General.Custom', onStatus);                   // the subscription is in place before the command goes out
            if (settled) return;
            wait(ACTIONS_TIMEOUT_MS, 'the list of actions did not arrive');
            const list = await client.getActions();
            if (settled) return;
            const found = isObj(list) && Array.isArray(list.actions) && list.actions.some(a => isObj(a) && a.id === actionId);
            if (!found) { finish({ kind: 'no-action' }); return; }
            wait(STATUS_TIMEOUT_MS, 'the action sent no status');
            waitingForStatus = true;
            await client.doAction({ id: actionId }, { pbCommand: 'status' });
        };

        try {
            const conn = ReadConnection();
            client = new StreamerbotClient({
                host: conn.host, port: conn.port, password: conn.password,
                immediate: false, autoReconnect: false, logLevel: 'none',
                onConnect: () => { ask().catch(err => fail(messageOf(err))); },
                onError: (err) => fail(messageOf(err)),
                onDisconnect: () => fail('the connection closed'),
            });
            wait(CONNECT_TIMEOUT_MS, 'Streamer.bot did not answer in time');
            client.connect(CONNECT_TIMEOUT_MS).catch(err => fail(messageOf(err)));
        } catch (err) { fail(messageOf(err)); }
    });
}


/////////////
// SCREEN  //
/////////////

let current = null;              // { entry, frame, startedAt, reported } while a dock page is shown or loading. reported is the version its last message named.
let currentManifest = null;
let runId = 0, retryTimer = null, revealTimer = null, titleObserver = null;
let switches = 0, updateSwitches = 0, fellBack = false;
let backendVersion = null;       // the version of the action when the router knows it from a live answer (the probe or a dock message), else null
let backendHasLoader = false;    // did that action send pb:'updater' while the probe listened?
let pinned = false;              // the person asked how to re-import: the dock page stays as it is and dock messages about the backend are ignored
let bannerSince = '';            // the selfUpdateSince the banner on screen is about

function SetView(kind, text, showRetry) {
    $('router-view').hidden = false;
    $('router-view').className = kind;
    $('router-text').textContent = text;
    $('retry-button').hidden = !showRetry;
}


///////////
// BANNER //
///////////

// The banner is a bar above the frame. It has no fixed height (the text wraps in a narrow OBS dock), so the frame and the loading screen
// are moved down by the measured height through one CSS variable. router.css reads it.
function ApplyBannerOffset() {
    const bar = $('router-banner');
    if (!bar) return;                                    // an index.html from before router 2 has no banner
    document.documentElement.style.setProperty('--banner-height', (bar.hidden ? 0 : bar.offsetHeight) + 'px');
}

// Has the person hidden the banner for this selfUpdateSince or a later one?
function BannerDismissed(since) {
    const kept = ParseVersion(local.get(BANNER_KEY));
    const wanted = ParseVersion(since);
    return !!kept && !!wanted && CompareParts(kept, wanted) >= 0;
}

// Shows or hides the banner for what the router knows now. It is called after the probe, after a dock message and after each of its buttons.
function RefreshBanner() {
    if (!$('router-banner') || !$('router-banner-text')) { bannerSince = ''; return; }       // an index.html from before router 2 has no banner
    const need = current && !pinned && backendVersion !== null ? NeedsBanner(currentManifest, backendVersion, backendHasLoader) : null;
    const show = !!need && !BannerDismissed(need.since);
    bannerSince = show ? need.since : '';
    if (show) {
        $('router-banner-text').textContent = `Printer Bot ${need.since} can update itself from this dock. Your Printer Bot is ${str(backendVersion, 40)}, so it needs one re-import first.`;
    }
    $('router-banner').hidden = !show;
    ApplyBannerOffset();
}

// Show how: the newest dock page explains the re-import. It stays, whatever the dock says about the backend, so the swap cannot undo itself.
function ShowHow() {
    if (!current || !currentManifest) return;
    const latest = PickFrontend(currentManifest, null);
    pinned = true;
    RefreshBanner();
    if (latest && latest.page !== current.entry.page) ShowFrame(latest, 'the person asked how to re-import');
}

// Hide: the banner stays away for this selfUpdateSince and every earlier one. With storage blocked it stays away until this page is loaded again.
function HideBanner() {
    if (bannerSince) local.set(BANNER_KEY, bannerSince);
    RefreshBanner();
}

function RemoveFrame() {
    clearTimeout(revealTimer);
    if (titleObserver) { titleObserver.disconnect(); titleObserver = null; }
    if (current && current.frame) current.frame.remove();
    current = null;
}

function Fail(text, autoRetry) {
    RemoveFrame();
    RefreshBanner();
    SetView('error', autoRetry ? `${text} Trying again in a few seconds.` : text, true);
    document.title = 'Printer Bot';
    if (autoRetry) retryTimer = setTimeout(() => Start(true), RETRY_MS);
}

// The address of a dock page: the page, its build as ?b=, and every query parameter of this page except b, t and r
// (so ?config=other.json still reaches the dock). Returns '' for an address outside this folder.
function FrameAddress(entry) {
    const url = new URL(entry.page, BASE);
    if (url.origin !== location.origin || !url.pathname.startsWith(BASE.pathname)) return '';
    url.search = '';
    url.searchParams.set('b', entry.build);
    for (const [key, value] of new URLSearchParams(location.search)) if (!DROPPED_PARAMS.has(key)) url.searchParams.append(key, value);
    return url.href;
}

function ShowFrame(entry, why) {
    RemoveFrame();
    const src = FrameAddress(entry);
    if (!src) { Fail('The dock page address is not valid.', false); return; }
    console.info(`[Printer Bot router] Showing ${entry.page} (${why})`);
    SetView('loading', 'Opening the dock…', false);
    const frame = document.createElement('iframe');
    frame.id = 'dock-frame';
    frame.name = FRAME_NAME;
    frame.title = 'Printer Bot';
    frame.className = 'dock-frame';
    frame.addEventListener('load', () => OnFrameLoad(frame, entry));
    frame.src = src;
    current = { entry, frame, startedAt: Date.now(), reported: null };
    document.body.append(frame);
    revealTimer = setTimeout(() => CheckSlowFrame(frame), REVEAL_MS);
}

function Reveal(frame) {
    if (!current || current.frame !== frame) return;
    clearTimeout(revealTimer);
    frame.classList.add('ready');
    $('router-view').hidden = true;
}

// Does the frame hold a page of its own? Until the host answers, a frame holds the empty page (about:blank) that every frame starts with.
// A page that the browser refused to show (a host that forbids framing, a failed load) is an error page of another origin that cannot be read.
function FrameHasPage(frame) {
    try {
        const doc = frame.contentDocument;
        return !!doc && doc.URL !== 'about:blank';
    } catch (e) { return false; }
}

// The load event of a frame comes after its last file. A dock page that has arrived but waits for a slow file is shown after REVEAL_MS anyway.
// A frame that has no page yet keeps the loading text and is looked at again every second. When LOAD_LIMIT_MS have passed the router gives up and offers Retry.
function CheckSlowFrame(frame) {
    if (!current || current.frame !== frame) return;
    if (FrameHasPage(frame)) { Reveal(frame); return; }
    if (Date.now() - current.startedAt >= LOAD_LIMIT_MS) { Fail(FRAME_FAILED, false); return; }
    revealTimer = setTimeout(() => CheckSlowFrame(frame), REVEAL_POLL_MS);
}

// A page that loaded but has no element with the id dock-wrapper is not a dock (a 404 page, a broken folder).
// The oldest dock page is tried instead, once.
function OnFrameLoad(frame, entry) {
    if (!current || current.frame !== frame) return;
    let doc = null;
    try { doc = frame.contentDocument; } catch (e) { }
    if (doc && doc.URL === 'about:blank') return;
    if (!doc || !doc.getElementById('dock-wrapper')) {
        const oldest = currentManifest && currentManifest.frontends[0];
        if (!fellBack && oldest && oldest.page !== entry.page) {
            fellBack = true;
            console.warn(`[Printer Bot router] ${entry.page} is not a dock page. Trying ${oldest.page} instead. A web host that forbids framing (X-Frame-Options or frame-ancestors) causes this too.`);
            ShowFrame(oldest, 'the first page was not a dock');
        }
        else Fail(FRAME_FAILED, false);
        return;
    }
    Reveal(frame);
    FollowTitle(doc);
}

// The router's title is the title of the dock page, including the change the dock makes after it has read its config.json
function FollowTitle(doc) {
    try {
        const copy = () => { document.title = doc.title || 'Printer Bot'; };
        copy();
        titleObserver = new MutationObserver(copy);
        titleObserver.observe(doc.querySelector('title') || doc.head, { childList: true, characterData: true, subtree: true });
    } catch (e) { }
}

// The dock tells this page which backend version it saw (dock pages from 2.3.0 on). If that points to another dock page, the frame is swapped.
// A dock page from 2.4.0 on reports again when the version changes while it is open, which is how a program update reaches this page.
// See MAX_SWITCHES and MAX_UPDATE_SWITCHES for the two budgets. While the frame is pinned, every message is ignored.
window.addEventListener('message', (event) => {
    if (!current || event.source !== current.frame.contentWindow || event.origin !== location.origin) return;
    const data = event.data;
    if (!isObj(data) || data.printerBot !== 'backend' || typeof data.version !== 'string') return;
    if (pinned) return;
    const version = str(data.version, 40);
    const later = current.reported !== null && current.reported !== version;      // this page named another version before: the backend changed under it
    current.reported = version;
    RememberVersion(version);
    backendVersion = version;
    RefreshBanner();
    const next = currentManifest && PickFrontend(currentManifest, version);
    if (!next || next.page === current.entry.page) return;
    if (later ? updateSwitches >= MAX_UPDATE_SWITCHES : switches >= MAX_SWITCHES) {
        console.warn(`[Printer Bot router] The dock reported backend ${version}. The frame was already swapped ${later ? updateSwitches : switches} times, so it stays.`);
        return;
    }
    if (later) updateSwitches++; else switches++;
    ShowFrame(next, `the dock reported backend ${version}`);
});

// quiet is true for the automatic retry after an error. The error stays on the screen until the new attempt has something else to show.
async function Start(quiet) {
    const run = ++runId;
    clearTimeout(retryTimer);
    RemoveFrame();
    switches = 0;
    updateSwitches = 0;
    fellBack = false;
    backendVersion = null;
    backendHasLoader = false;
    pinned = false;
    RefreshBanner();
    if (!quiet) SetView('loading', 'Loading Printer Bot…', false);
    try {
        let manifest;
        try {
            const loaded = await LoadManifest();
            if (run !== runId) return;
            if (MaybeSelfUpdate(loaded.router)) return;
            if (!loaded.manifest) throw new Error('it has no list of dock pages');
            manifest = loaded.manifest;
        }
        catch (err) {
            if (run === runId) Fail(`Could not load versions.json (${messageOf(err)}).`, true);
            return;
        }
        if (manifest.frontends.length === 0) { Fail('versions.json lists no dock page this router can use.', true); return; }
        currentManifest = manifest;

        SetView('loading', 'Looking for Streamer.bot…', false);
        const probe = await ProbeBackend(manifest.actionId);
        if (run !== runId) return;

        let backend = null, why;
        if (probe.kind === 'version') {
            RememberVersion(probe.version);
            backend = probe.version;
            backendVersion = probe.version;
            backendHasLoader = probe.updater === true;
            why = `the action reports version "${probe.version}"`;
        }
        else if (probe.kind === 'no-action') {
            ForgetVersion();
            why = 'the action is not in Streamer.bot yet';
        }
        else {
            const kept = ReadRemembered();
            backend = kept.version;
            why = `no answer from Streamer.bot (${probe.why}), ${backend !== null ? `remembered version "${backend}"`
                : kept.expired !== null ? `the remembered version "${kept.expired}" is too old to trust` : 'nothing remembered'}`;
        }
        ShowFrame(PickFrontend(manifest, backend), why);
        RefreshBanner();
    }
    catch (err) {
        console.error('[Printer Bot router] Unexpected error:', err);
        if (run === runId) Fail(`Something went wrong (${messageOf(err)}).`, false);
    }
}

on('retry-button', 'click', () => Start(false));
on('banner-show-button', 'click', ShowHow);
on('banner-hide-button', 'click', HideBanner);
if (typeof ResizeObserver === 'function' && $('router-banner')) new ResizeObserver(ApplyBannerOffset).observe($('router-banner'));
else window.addEventListener('resize', ApplyBannerOffset);

// The pure parts are public so that tests can call them
window.PrinterBotRouter = Object.freeze({ ROUTER_BUILD, ParseVersion, NormalizeManifest, PickFrontend, NeedsBanner });

if (window.name === FRAME_NAME) SetView('error', 'This page is the router. It cannot open inside the dock frame.', false);
else Start(false);
