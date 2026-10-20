// ============================================================================
// Printer Bot dock: more than one printer, and the rules that choose the printers of an event (3.0)
//
// With one printer nothing here is visible: the rows of printer 1 sit where they always did and one row offers "Add another printer".
// With more printers the Settings card shows a card for each printer. The card holds the printer's own settings. 3.2.0-beta.5: the rules that send events
// to the printers are one list below the cards (the rules section), each with its printer, read from the top, and its last row names the printer for
// everything that no rule takes (until then the rules were in the cards). 3.2.0-beta.6: the row Paper size is Default paper size. 3.2.0-beta.7: with Do not stop
// at first match on every rule an event matches prints, and the route check names the rules that add no print. Up to 100 printers and 300 rules work (the action says its limits in
// every status). With more than five extra printers the cards of printers 2 and up start collapsed to one line, and a card builds its content the first
// time it is opened.
//
// What the page shows is a working copy of printers 2 and up and of the routing (`working`). It can hold a rule that is not finished (a trigger still to be
// picked, a parameter without a name, a value that is missing). Such a rule is shown with a warning and is not sent. If the rule was saved before the edit,
// its last complete version (`good`) stays in force until the edit is complete, so a rule that is being changed does not stop working. A new rule is
// saved when it is complete, which is when a trigger is picked. Every edit is sent after a moment, like the other settings, and the action answers
// with a status. When the action's settings differ from what was sent and nothing is waiting, the page takes the action's settings.
//
// A status must not cost a rebuild of every card. Each card (and, from 3.2.0-beta.5, each rule) has a signature (the data it is made from), and it is made again only when its signature
// changed. A control of a card names its printer, rule and condition by number and reads the working copy when it is used, because the working copy
// is replaced by a new one whenever the action's settings are taken. The lists of printers (the printer for everything else, the printer to test on, the
// printer of each card, and from 3.2.0-beta.5 the printer of each rule) are filled in place when the printers change.
//
// This file is loaded before app.js, so nothing at the top level may call app.js. The functions below use its helpers (h, str, num, isObj, hasOwn, store, Send,
// pbStatus, pendingSettings) when they run. They only run after both files have loaded.
// ============================================================================

const rt$ = (id) => document.getElementById(id);

const RT_MODES = ['escpos', 'windows', 'png', 'vc500w'];
const RT_MODE_NAMES = { escpos: 'Thermal printer (ESC/POS)', windows: 'Windows printer driver', png: 'Preview only (no printer)', vc500w: 'Brother VC-500W sticker printer' };
const RT_MODE_SHORT = { escpos: 'Thermal', windows: 'Windows driver', png: 'Preview only', vc500w: 'VC-500W stickers' };
// 3.2.0: a Brother VC-500W sticker printer: its connection, the tape in it (0 = the width the printer reports), its quality and its cut. Only these exact values are kept; the action keeps
// the same ones (PbVc500w) and clears an address of another shape. 3.2.0-beta.8 (the audit of 19 October): the dock holds the address to the action's own rule (AddressShapeOk), so an
// address the action would clear is refused here at once, with a sentence in its row (it was only trimmed and held to no spaces, no scheme, no path, no user: the box went empty
// after the action's answer, with no word).
const RT_VC_CONNECTIONS = ['wifi', 'usb'];
const RT_VC_CONNECTION_NAMES = { wifi: 'Wi-Fi', usb: 'USB' };
const RT_VC_TAPES = [0, 50, 25, 19, 12, 9];
const RT_VC_TAPE_NAMES = { 0: 'Ask the printer', 50: '50 mm (CZ-1005)', 25: '25 mm (CZ-1004)', 19: '19 mm (CZ-1003)', 12: '12 mm (CZ-1002)', 9: '9 mm (CZ-1001)' };
const RtVcTapeOf = (value) => { const n = Math.round(num(value)); return RT_VC_TAPES.includes(n) ? n : 0; };
const RT_VC_QUALITIES = ['vivid', 'normal'];
const RT_VC_QUALITY_NAMES = { vivid: 'Vivid', normal: 'Normal' };
const RT_VC_CUTS = ['full', 'half', 'none'];
const RT_VC_CUT_NAMES = { full: 'Full', half: 'Half', none: 'None' };
// A host name of labels (letters, digits and hyphens, no hyphen at either end of a label, 63 at most, a dot at the end allowed); all four parts of an IPv4 address as the action
// writes it (no shorthand such as 192.168.1, no leading zeros, nothing above 255); an IPv6 address, in brackets or not, with a zone of digits after % (fe80::1%12). A number in hex
// (0x7f000001, 0x7f.1) is an IPv4 address of another form to the action, which it refuses, and so is it here.
const RT_VC_HOST = /^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$/;
const RtVcIpv4Ok = (a) => { const p = a.split('.'); return p.length === 4 && p.every(x => /^(0|[1-9][0-9]{0,2})$/.test(x) && Number(x) <= 255); };
function RtVcIpv6Ok(a) {
    let s = a.startsWith('[') && a.endsWith(']') ? a.slice(1, -1) : a;
    const zone = s.indexOf('%');
    if (zone >= 0) { if (!/^[0-9]+$/.test(s.slice(zone + 1))) return false; s = s.slice(0, zone); }
    const halves = s.split('::');
    if (halves.length > 2) return false;
    let groups = 0;
    for (let i = 0; i < halves.length; i++) {
        if (halves[i] === '') continue;
        const parts = halves[i].split(':');
        for (let j = 0; j < parts.length; j++) {
            const last = i === halves.length - 1 && j === parts.length - 1;
            if (last && parts[j].includes('.')) { if (!RtVcIpv4Ok(parts[j])) return false; groups += 2; }        // an IPv4 address at the end is two groups (::ffff:192.168.1.5)
            else if (/^[0-9A-Fa-f]{1,4}$/.test(parts[j])) groups += 1;
            else return false;
        }
    }
    return halves.length === 2 ? groups <= 7 : groups === 8;
}
function RtVcAddressOk(a) {
    if (!a || a.length > 253) return false;
    if (/^[0-9.]+$/.test(a)) return RtVcIpv4Ok(a);
    if (a.includes(':') || a.startsWith('[')) return RtVcIpv6Ok(a);
    if (/^(0x[0-9a-f]+|[0-9]+)(\.(0x[0-9a-f]+|[0-9]+)){0,3}$/i.test(a)) return false;
    return RT_VC_HOST.test(a);
}
const RtVcAddressClean = (value) => { const a = str(value, 253).trim(); return RtVcAddressOk(a) ? a : ''; };
// The sentence for an address the dock did not keep (the person typed something), '' otherwise
const RtVcAddressRefused = (raw, kept) => { const t = String(raw == null ? '' : raw).trim(); return kept === '' && t !== '' ? `"${t.slice(0, 60)}" is not a host name or an IP address, so it was not kept.` : ''; };
const RT_VC_CONNECTION_TEXT = 'Wi-Fi: the printer on your network, by its address. USB: the printer\'s Windows print queue (choose it above). Over USB the printer says nothing back, so the dock cannot tell when it is asleep, out of tape or blocked.';
const RT_VC_ADDRESS_TEXT = 'The printer\'s name or IP address on your network (a DHCP reservation keeps it the same). It must be on this PC\'s network: a private address, or one in the same subnet as this PC.';
const RT_VC_TAPE_TEXT = 'The cassette in the printer. Ask the printer reads it over Wi-Fi (over USB it is 50 mm).';
const RT_VC_QUALITY_TEXT = 'Vivid prints slower with the better colour. Normal is faster.';
const RT_VC_CUT_TEXT = 'Full cuts the sticker loose. Half cuts the sticker but not its backing, so the stickers stay on one strip. None does not cut.';
const RT_DITHERS = ['floyd', 'atkinson', 'threshold'];
const RT_DITHER_NAMES = { floyd: 'Detailed', atkinson: 'Soft', threshold: 'Crisp (no shading)' };
const RT_PROFILES = ['bw', 'color'];
const RT_PROFILE_NAMES = { bw: 'Black and white', color: 'Color' };
// 3.0.0-beta.10: the layout of a page of Letter paper. Only these two exact texts are the layout. Any other value (a number, a list, other text, capitals, spaces, nothing) is the layout
// of every earlier version, scaled, in what the page shows and in what it sends.
const RT_LAYOUTS = ['scaled', 'message'];
const RT_LAYOUT_NAMES = { scaled: 'Scaled like 80 mm', message: 'Large message' };
const RtLayoutOf = (value) => RT_LAYOUTS.includes(value) ? value : 'scaled';
// 3.0.0: how a picture in a message is set in the space the large layout gives it. Only these three exact texts are a fit. Any other value (a number, a list, other text, capitals, spaces,
// nothing) shows as fit and is sent as fit, which is what the action does with it too (the default was fill until 3.0.1).
const RT_FITS = ['fill', 'fit', 'stretch'];
const RT_FIT_NAMES = { fill: 'Fill', fit: 'Fit', stretch: 'Stretch' };
const RtFitOf = (value) => RT_FITS.includes(value) ? value : 'fit';
const RT_CUTS = ['partial', 'full', 'none'];
const RT_CUT_NAMES = { partial: 'Partial', full: 'Full', none: 'None' };
const RT_DEFAULT_LIMITS = { printers: 100, rules: 300, conditions: 4, valueChars: 48 };
const RT_MAX_LIMITS = { printers: 100, rules: 300 };         // what this page is built and tested for. A larger number in a status is held to it
const RT_OPEN_CARDS = 5;         // up to this many extra printers the cards start open. With more they start collapsed
const RT_STATUS_ROWS = 5;        // up to this many printers the status card has a row for each. With more it has one summary row
const RT_NAMES_SHOWN = 10;       // the answer of the route check names this many printers and then says "and N more"
const RT_LAST_SHOWN = 5;         // the Last print row names this many printers and then says "and N more"
const RT_CARDS_KEY = 'pbPrinterCards';       // browser storage: which cards the person opened or closed
const RT_TRIGGER_NAME = /^(\*|[A-Za-z0-9_]{1,48}\*?)$/;
const RT_FIELD_NAME = /^[A-Za-z0-9_.[\]-]{1,64}$/;

const RT_TRIGGERS = new Map(ROUTE_CATALOG.triggers.map(t => [t.id, t]));
const RT_FAMILIES = new Map(ROUTE_CATALOG.families.map(f => [f.id, f]));
const RT_OP_KIND = (() => {
    const kinds = {};
    for (const kind of Object.keys(ROUTE_CATALOG.operators)) for (const pair of ROUTE_CATALOG.operators[kind]) kinds[pair[0]] = kind;
    return kinds;
})();
// The words of a test in the sentence under a rule (words only, so the sentence reads as a sentence). The list of tests of a condition has its own words, RtOpMenuText.
const RT_OP_NAME = (() => {
    const names = {};
    for (const kind of Object.keys(ROUTE_CATALOG.operators)) for (const pair of ROUTE_CATALOG.operators[kind]) names[pair[0]] = pair[1];
    return names;
})();
const RtOpMenuText = (pair) => pair.length > 2 ? pair[2] : pair[1];          // a number test shows its math symbol after the words in the list
const RtNeedsValue = (op) => !ROUTE_CATALOG.noValue.includes(op);
const RT_OTHER = '@other';       // the value of the entry "Other parameter..." in a list of parameters. No parameter name starts with @

let working = null;             // { extras: [printers 2 and up], routing: { routeAllElse, rules: [...] } } as the person sees it
let rtMoved = false;            // are the rows of printer 1 inside its card?
let rtFocusKey = '';            // the control to give the focus back to after a card is built again
let rtArmed = 0;                // the printer whose Remove button was pressed once
let rtArmTimer = null;
let rtCheckId = 0;
const rtCheckValues = {};       // what the person typed in the route check, by parameter name
const rtRecs = new Map();       // printer number -> { el, sig, content, built }: the card on the page, what it was made from, and whether its content is built
let rtOpenState = null;         // printer number -> true or false: the choices of the person, read from the browser storage at the first use
let rtDefaultOpen = null;       // are the cards open until the person says otherwise? Decided once, at the first cards of this page
let rtInfoList = null;          // the list of printers of the status that rtInfoMap was made from
let rtInfoMap = new Map();      // printer number -> the entry of the status
let rtElseSig = '', rtTestSig = '', rtCheckSig = '';       // what the lists were last filled from
let rtStatusOpen = false;       // is the list of printers that cannot print open in the status card?
let rtDrag = null;              // 3.2.0-beta.4: the rule that is dragged by its handle now (RtHookMove), or null
let rtOneHeld = null;           // 3.2.0-beta.4: printer 1's settings as its controls showed them when RtBuild began (RtConfigOf, while RtBuild has the controls out of the document)
const rtRuleRecs = new Map();   // 3.2.0-beta.5: place in the list -> { el, sig }: a rule of the rules section and what it was built from (RtBuildRules)


// ---- the settings of the action, cleaned ---------------------------------------------------------------------------------------

function RtLimits() {
    const r = pbStatus && isObj(pbStatus.routing) ? pbStatus.routing : {};
    const take = (value, fallback, max) => { const n = Math.round(num(value)); return n >= 1 ? Math.min(n, max) : fallback; };
    return {
        printers: take(r.maxPrinters, RT_DEFAULT_LIMITS.printers, RT_MAX_LIMITS.printers), rules: take(r.maxRules, RT_DEFAULT_LIMITS.rules, RT_MAX_LIMITS.rules),
        conditions: num(r.maxConditions) || RT_DEFAULT_LIMITS.conditions, valueChars: num(r.maxValueChars) || RT_DEFAULT_LIMITS.valueChars,
    };
}

const RtClamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(num(v))));

function RtCleanExtra(p) {
    p = isObj(p) ? p : {};
    return {
        printer: str(p.printer, 256).trim(),
        paperWidthMm: RtClamp(p.paperWidthMm == null ? 80 : p.paperWidthMm, 40, 110),
        paperSize: p.paperSize === 'letter' || p.paperSize === '4x6' ? p.paperSize : 'roll',          // 3.2.0-beta.2: or the card of 4 x 6 in
        mode: RT_MODES.includes(p.mode) ? p.mode : 'escpos',
        printProfile: RT_PROFILES.includes(p.printProfile) ? p.printProfile : 'bw',
        letterLayout: RtLayoutOf(p.letterLayout),                                               // 3.0.0-beta.10: the layout of a Letter page, scaled or message (a file or a status from before has none: scaled)
        letterImageFit: RtFitOf(p.letterImageFit),                                              // 3.0.0: how a picture is set in the large layout: fill, fit or stretch (a file or a status from before has none: fit)
        allowHighRoller: typeof p.allowHighRoller === 'boolean' ? p.allowHighRoller : true,
        allowImages: typeof p.allowImages === 'boolean' ? p.allowImages : true,                // 3.0.0-beta.9: pictures from links in messages print on this printer (a file from before has none: yes)
        allowYouTubeHighRoller: p.allowYouTubeHighRoller === true,                              // 3.0.2: off unless it is exactly true (the action leaves the key out of a printer that has it off)
        uncutHypeTrain: p.uncutHypeTrain === true,
        dither: RT_DITHERS.includes(p.dither) ? p.dither : 'floyd',
        cut: RT_CUTS.includes(p.cut) ? p.cut : 'partial',
        feedDots: RtClamp(p.feedDots == null ? 80 : p.feedDots, 0, 400),
        // 3.2.0: a Brother VC-500W sticker printer (a file or a status from before has none: Wi-Fi, no address, the printer's tape, vivid, a full cut)
        vcConnection: RT_VC_CONNECTIONS.includes(p.vcConnection) ? p.vcConnection : 'wifi',
        vcAddress: RtVcAddressClean(p.vcAddress),
        vcTapeMm: RtVcTapeOf(p.vcTapeMm),
        vcQuality: RT_VC_QUALITIES.includes(p.vcQuality) ? p.vcQuality : 'vivid',
        vcCut: RT_VC_CUTS.includes(p.vcCut) ? p.vcCut : 'full',
        paperTray: RtTrayClean(p.paperTray),                                                    // 3.2.0-beta.3: the tray of its driver ('' = the one the driver chooses)
    };
}

function RtCleanCondition(c) {
    c = isObj(c) ? c : {};
    return { field: str(c.field, 64).trim(), op: str(c.op, 20).trim(), value: str(c.value, 48) };
}

function RtCleanRule(r, conditions) {
    r = isObj(r) ? r : {};
    return { to: Math.round(num(r.to)) || 1, trigger: str(r.trigger, 48).trim(), when: (Array.isArray(r.when) ? r.when : []).slice(0, conditions).map(RtCleanCondition),
             paperSize: RtRulePaperOf(r.paperSize), paperTray: RtTrayClean(r.paperTray) };          // 3.2.0-beta.3: what it prints on ('' = the printer's own)
}

function RtReadConfig(settings) {
    const st = isObj(settings) ? settings : {};
    const routing = isObj(st.routing) ? st.routing : {};
    const limits = RtLimits();
    const cfg = {
        extras: (Array.isArray(st.extraPrinters) ? st.extraPrinters : []).slice(0, limits.printers - 1).map(RtCleanExtra),
        routing: { routeAllElse: Math.round(num(routing.routeAllElse)) || 1, rules: (Array.isArray(routing.rules) ? routing.rules : []).slice(0, limits.rules).map(r => RtCleanRule(r, limits.conditions)),
                   stopAtFirstMatch: routing.stopAtFirstMatch === true },                // 3.2.0-beta.5: no key (a setup from before) = every rule is read
    };
    RtMarkGood(cfg);
    return cfg;
}

// ---- 3.2.0-beta.3: the trays of a printer, and the paper and the tray of a rule -----------------------------------------------
// A printer on the Windows printer driver takes a page (Letter or the card) from a tray of its driver: the one of its row Tray (paperTray, '' = the tray the driver chooses), or the one
// of the rule that chose it for an event. A rule of a printer on the Windows printer driver or the preview can name a paper (paperSize: '' = the printer's own, 'letter', '4x6') and, on
// the driver, a tray (paperTray: '' = the printer's own). The first rule of a printer that an event passes decides them (the action, Routing.Route). The trays a printer can choose are
// the ones the status lists for it (status.printers, trays), by their names as the driver gives them.
const RT_TRAY_MAX = 64;
const RT_TRAY_DEFAULT = "The driver's default tray";
const RT_TRAY_TEXT = 'The tray of the printer that a page or a card is taken from. A rule of this printer can choose another tray.';
const RT_RULE_PAPERS = ['', 'letter', '4x6'];
const RtRulePaperOf = (v) => RT_RULE_PAPERS.includes(v) ? v : '';

// The name of a tray, cleaned as the action cleans it (Routing.CleanTray, PB.Safe): a character that cannot be shown becomes a space, at most 64, no spaces at its ends
function RtTrayClean(v) {
    if (typeof v !== 'string') return '';
    let out = '';
    for (let i = 0; i < v.length && out.length < RT_TRAY_MAX; i++) {
        const c = v.charCodeAt(i);
        const bad = c < 32 || c === 127 || (c >= 128 && c < 160) || c === 0x2028 || c === 0x2029 || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069) || c === 0x200E || c === 0x200F || c === 0x061C;
        out += bad ? ' ' : v[i];
    }
    if (out.length > 0 && /[\uD800-\uDBFF]/.test(out[out.length - 1])) out = out.slice(0, -1);
    return out.trim();
}

// Does the action know trays? (an action from before 3.2.0-beta.3 has no paperTray among its settings)
const RtTrayKnown = () => !!pbStatus && isObj(pbStatus.settings) && hasOwn(pbStatus.settings, 'paperTray');

// The settings of printer `slot` as the page shows them now: printer 1 from its controls, or, while RtBuild has them out of the document for a moment, as they were when it began
// (3.2.0-beta.4: until then from what the action holds, which is the old output or paper while a change of printer 1 waits for its save, so its rules were built for the old one)
const RtConfigOf = (slot) => slot === 1 ? (rt$('paperWidthMm') ? Rt1Config() : rtOneHeld || RtCleanExtra(pbStatus && isObj(pbStatus.settings) ? pbStatus.settings : {})) : (working ? working.extras[slot - 2] : null);

// The settings a rule gives its printer: the rule's paper, for the Windows printer driver and the preview
const RtWithRule = (c, rule) => rule && rule.paperSize && (c.mode === 'windows' || c.mode === 'png') ? Object.assign({}, c, { paperSize: rule.paperSize }) : c;

// The pages printer `slot` with the settings `c` prints: its own paper when that is a page, and the papers its rules name (only a printer on the driver or the preview has pages)
function RtPapersOf(c, slot) {
    const papers = new Set();
    if (RtIsLetter(c)) papers.add('letter');
    if (RtIsCard(c)) papers.add('4x6');
    if (working && (c.mode === 'windows' || c.mode === 'png')) { const named = RtRulePapers().get(slot); if (named) for (const p of named) papers.add(p); }
    return papers;
}

// 3.2.0-beta.8 (the audit of 19 October): the papers the rules name, by printer, read from the rules once until they change (RtEdit, or another working copy), not once for every card:
// with 100 printers and 300 rules the facts of the cards read the rules 30,000 times at every status and every key typed
let rtRulePapers = null;                        // { rules: the list they were read from, map: printer -> Set of papers }
function RtRulePapers() {
    if (rtRulePapers && rtRulePapers.rules === working.routing.rules) return rtRulePapers.map;
    const map = new Map();
    for (const r of working.routing.rules) if (r.paperSize) { if (!map.has(r.to)) map.set(r.to, new Set()); map.get(r.to).add(r.paperSize); }
    rtRulePapers = { rules: working.routing.rules, map };
    return map;
}

// Fills a list of trays: first `firstLabel` (the value ''), then the trays the status lists for printer `slot`, and a tray that is chosen but not listed. It is filled again only when
// its content changed.
function RtFillTraySelect(select, slot, value, firstLabel) {
    const info = RtPrinterInfo(slot);
    const trays = info && Array.isArray(info.trays) ? info.trays.map(RtTrayClean).filter(t => t) : [];
    const listed = !!info && Array.isArray(info.trays) && !info.traysNote;
    const items = [['', firstLabel]].concat(trays.map(t => [t, t]));
    const match = RtTrayOf(trays, value);                                                     // 3.2.0-beta.7: "Tray 1" is the driver's "Tray1"
    if (value && !match) items.push([value, listed ? `${value} (not a tray of this printer)` : value]);
    const shown = match || value;
    const sig = JSON.stringify([items, shown]);
    if (select._rtSig === sig) return;
    select._rtSig = sig;
    RtSetOptions(select, items, shown);
}

// 3.2.0-beta.7: the tray of the driver that a saved name means, as the action finds it (GdiPrinter.FindTray): the same name, or the same name with no spaces in it and in any
// capitals ("Tray 1" is Brother's "Tray1", "MPTray" its "MP Tray"), so a rule keeps its tray when the printer gets another driver. '' when the driver has none of that name.
function RtTrayOf(trays, value) {
    if (!value) return '';
    if (trays.includes(value)) return value;
    const key = (t) => String(t).replace(/\s+/g, '').toLowerCase();
    return trays.find(t => key(t) === key(value)) || '';
}

// What a rule prints on, for its sentence: ' on Letter paper', ' on a 4 x 6 in card from Tray 1', ' from MPTray', or '' when it prints on the printer's own paper and tray
function RtRulePrintsOn(rule) {
    const c = RtConfigOf(rule.to);
    if (!c || !(c.mode === 'windows' || c.mode === 'png')) return '';
    const paper = rule.paperSize === 'letter' ? 'Letter paper' : rule.paperSize === '4x6' ? 'a 4 x 6 in card' : '';
    const tray = c.mode === 'windows' && rule.paperTray && RtIsPage(RtWithRule(c, rule)) ? rule.paperTray : '';
    return (paper ? ' on ' + paper : '') + (tray ? ' from ' + tray : '');
}

// The row of a rule that says what it prints on: the paper (a printer on the Windows printer driver or the preview) and the tray (on the driver, for a page)
function RtBuildRulePaper(ri, rule, c) {
    const own = RtPaperText(c);
    const paper = RtFocus(RtSelect([['', `The printer's paper (${own})`], ['letter', 'Letter (8.5 x 11 in)'], ['4x6', '4 x 6 in card (landscape)']], rule.paperSize, { 'aria-label': `Paper of rule ${ri + 1}` }), `rz${ri}`);
    paper.addEventListener('change', () => RtEdit(w => { const r = RtRuleAt(w, ri); if (r) r.paperSize = RtRulePaperOf(paper.value); }, true));
    const row = h('div', { class: 'rule-paper' }, h('span', { class: 'rule-paper-label' }, 'Prints on'), paper);
    if (c.mode === 'windows' && RtTrayKnown() && RtIsPage(RtWithRule(c, rule))) {
        const tray = RtFocus(h('select', { 'aria-label': `Tray of rule ${ri + 1}` }), `ry${ri}`);
        RtFillTraySelect(tray, rule.to, rule.paperTray, `The printer's tray (${c.paperTray || "the driver's default"})`);
        tray.addEventListener('change', () => RtEdit(w => { const r = RtRuleAt(w, ri); if (r) r.paperTray = RtTrayClean(tray.value); }, true));
        row.append(h('span', { class: 'rule-paper-label' }, 'from'), tray);
    }
    return row;
}

// The paper and the tray a printer of the route check prints it on, for its sentence ('on a 4 x 6 in card from MPTray'), or '' for the printer's own
function RtChoicePhrase(choice) {
    const paper = choice.paperSize === 'letter' ? 'on Letter paper' : choice.paperSize === '4x6' ? 'on a 4 x 6 in card' : '';
    const tray = RtTrayClean(choice.paperTray);
    return [paper, tray ? 'from ' + tray : ''].filter(x => x).join(' ');
}

// A printer of the list as it is sent to the action: cleaned (RtCleanExtra), and (3.2.0-beta.3) without a tray when it has none, as the action leaves the key out of its status then:
// a printer with no tray is sent as it was before trays, and a restored file is found again in the status
function RtExtraForSending(p) {
    const c = RtCleanExtra(p);
    if (!c.paperTray) delete c.paperTray;
    return c;
}

// A rule that can be sent: its printer is there, it has no more conditions than the action keeps, and it is complete
function RtRuleSavable(r, count, limits) {
    if (!(r.to >= 1 && r.to <= count) || r.when.length > limits.conditions || RtRuleProblem(r) !== '') return false;
    return r.when.every(c => c.value.trim().length <= limits.valueChars);
}

// The part of a rule that its last complete version keeps: the trigger, the conditions, (3.2.0-beta.3) the paper and the tray, and (3.2.0-beta.5) the printer, which a rule can
// change now: a rule that is being edited stays in force on the printer it had
const RtPart = (r) => ({ to: r.to, trigger: r.trigger, when: r.when.map(c => ({ field: c.field, op: c.op, value: c.value })), paperSize: r.paperSize || '', paperTray: r.paperTray || '' });

// Remembers the complete version of every rule that is complete now
function RtMarkGood(cfg) {
    const count = 1 + cfg.extras.length;
    const limits = RtLimits();
    for (const r of cfg.routing.rules) if (RtRuleSavable(r, count, limits)) r.good = RtPart(r);
}

// What the action is sent. A rule that is not complete is sent as it was when it was last complete, or not at all when it never was.
function RtForSaving(cfg) {
    const limits = RtLimits();
    const count = 1 + cfg.extras.length;
    const rules = [];
    for (const r of cfg.routing.rules) {
        const part = RtRuleSavable(r, count, limits) ? RtPart(r) : (r.good && r.good.to >= 1 && r.good.to <= count ? r.good : null);
        if (!part || rules.length >= limits.rules) continue;
        const sent = { to: part.to, trigger: part.trigger, when: part.when.map(c => ({ field: c.field, op: c.op, value: RtNeedsValue(c.op) ? c.value.trim() : '' })) };
        if (part.paperSize) sent.paperSize = part.paperSize;             // 3.2.0-beta.3: only what a rule names: a rule on its printer's own paper and tray is sent as before
        if (part.paperTray) sent.paperTray = part.paperTray;
        rules.push(sent);
    }
    const rest = cfg.routing.routeAllElse;
    const routing = { routeAllElse: rest >= 1 && rest <= count ? rest : 1, rules };
    if (cfg.routing.stopAtFirstMatch) routing.stopAtFirstMatch = true;          // 3.2.0-beta.5: only while the first match decides: a setup that reads every rule is sent as before
    return { extraPrinters: cfg.extras.map(RtExtraForSending), routing };
}

const RtCanon = (cfg) => JSON.stringify(RtForSaving(cfg));

function RtWaiting() {
    return !!pendingSettings && (hasOwn(pendingSettings, 'extraPrinters') || hasOwn(pendingSettings, 'routing') || hasOwn(inFlight, 'extraPrinters') || hasOwn(inFlight, 'routing'));
}


// ---- looking things up -----------------------------------------------------------------------------------------------------------

const RtFieldsOf = (triggerId) => RT_TRIGGERS.has(triggerId) ? RT_TRIGGERS.get(triggerId).fields : [];
const RT_YOUTUBE_MONEY = ['YouTubeSuperChat', 'YouTubeSuperSticker'];      // 3.0.9: their microAmount is tested in the streamer's currency (Routing.Passes)
const RtFieldInfo = (triggerId, name) => RtFieldsOf(triggerId).find(f => f.name === name) || null;
const RtKindOf = (rule, cond) => { const info = RtFieldInfo(rule.trigger, cond.field); return info ? info.type : (RT_OP_KIND[cond.op] || 'text'); };

function RtDefaultOp(kind) { return kind === 'number' ? '>=' : kind === 'flag' ? 'yes' : 'is'; }

// A value as the person reads it: a choice by its name, a scaled number in its own unit
function RtValueText(info, cond) {
    if (!RtNeedsValue(cond.op)) return '';
    if (info && info.choices) {
        const hit = info.choices.find(c => c[0] === cond.value);
        if (hit) return hit[1];
    }
    if (info && info.factor && cond.value !== '' && isFinite(Number(cond.value))) return String(Number(cond.value) / info.factor);
    return cond.value === '' ? '...' : cond.value;
}

function RtConditionText(rule, cond) {
    const info = RtFieldInfo(rule.trigger, cond.field);
    const label = info ? info.label : (cond.field || '...');
    const op = RT_OP_NAME[cond.op] || '...';
    const value = RtValueText(info, cond);
    return `${label} ${op}${value === '' ? '' : ' ' + (RtKindOf(rule, cond) === 'text' && !(info && info.choices) ? '"' + value + '"' : value)}`;
}

// "Prints every Twitch Cheer where Bits is greater than 500 and Message is not empty." The trigger is named as a phrase: the platform and the event
function RtTriggerPhrase(id) {
    if (RT_FAMILIES.has(id)) { const text = RT_FAMILIES.get(id).label; return text.charAt(0).toLowerCase() + text.slice(1); }
    const t = RT_TRIGGERS.get(id);
    return t ? `${t.platform} ${t.label}` : id;
}

function RtRuleSentence(rule) {
    if (RT_FAMILIES.has(rule.trigger)) return `Prints ${RtTriggerPhrase(rule.trigger)}${RtRulePrintsOn(rule)}.`;
    const where = rule.when.map(c => RtConditionText(rule, c)).join(' and ');
    return `Prints every ${RtTriggerPhrase(rule.trigger)}${where ? ' where ' + where : ''}${RtRulePrintsOn(rule)}.`;
}

// What is missing from a rule, or '' when the rule is complete
function RtRuleProblem(rule) {
    if (!(rule.to >= 1)) return 'Choose a printer.';                       // 3.2.0-beta.5: a new rule has none until one is chosen
    if (!RT_TRIGGER_NAME.test(rule.trigger)) return 'Pick a trigger.';
    for (const c of rule.when) {
        const label = RtFieldInfo(rule.trigger, c.field) ? RtFieldInfo(rule.trigger, c.field).label : c.field;
        if (!RT_FIELD_NAME.test(c.field)) return 'Name the parameter.';
        if (!RT_OP_KIND[c.op]) return 'Pick a test for ' + label + '.';
        if (RtNeedsValue(c.op) && c.value.trim() === '') return 'Give ' + label + ' a value.';
        if (RT_OP_KIND[c.op] === 'number' && !isFinite(Number(c.value))) return 'The value of ' + label + ' is not a number.';
    }
    return '';
}

// The line under a rule: what it does, or what is missing and what happens meanwhile
function RtRuleLine(rule) {
    const problem = RtRuleProblem(rule);
    if (!problem) return RtRuleSentence(rule);
    return `${problem} ${rule.good ? 'Until then the rule stays as it was last saved.' : 'Until then the rule is not saved.'}`;
}


// ---- the status of each printer -----------------------------------------------------------------------------------------------

function RtPrinterInfo(slot) {
    const list = pbStatus && Array.isArray(pbStatus.printers) ? pbStatus.printers : [];
    if (rtInfoList !== list) {
        rtInfoList = list;
        rtInfoMap = new Map();
        for (const p of list) if (!rtInfoMap.has(p.slot)) rtInfoMap.set(p.slot, p);
    }
    return rtInfoMap.get(slot) || null;
}

function RtPrinterName(slot) {
    if (slot > 1 && working && working.extras[slot - 2]) {
        const e = working.extras[slot - 2];
        return RtIsStickerWifi(e) ? e.vcAddress : e.printer;          // what the person chose, before the action has answered (3.2.0: a sticker printer on Wi-Fi is its address)
    }
    if (slot === 1) {
        // 3.2.0: printer 1 as a sticker printer on Wi-Fi is the address in its box. The rows of printer 1 are out of the document for a moment while the cards are built
        // (RtBuild moves them), and this is called from there too, so a box that cannot be found falls through to the name the action reported (its address as well).
        const mode = rt$('mode'), connection = rt$('vcConnection'), address = rt$('vcAddress');
        if (mode && connection && address && mode.value === 'vc500w' && connection.value !== 'usb') return address.value.trim();
    }
    const info = RtPrinterInfo(slot);
    return info && info.name ? info.name : '';
}

// The output of a printer as it is set now. Printer 1 has its own control.
function RtModeOf(slot) {
    if (slot === 1) return rt$('mode').value;
    return working && working.extras[slot - 2] ? working.extras[slot - 2].mode : '';
}

// The words on the right of the heading of a card
function RtCardName(slot) {
    if (RtModeOf(slot) === 'png') return 'Preview only';
    if (RtModeOf(slot) === 'vc500w' && RtIsStickerWifi(slot === 1 ? Rt1Config() : working.extras[slot - 2])) return RtPrinterName(slot) || 'No address yet';
    return RtPrinterName(slot) || (slot === 1 ? 'Auto-detect' : 'Not set up yet');
}

const RtPrinterLabel = (slot) => `Printer ${slot}` + (RtPrinterName(slot) ? ` (${RtPrinterName(slot)})` : '');

// A printer in a list, as number and name: "12: Receipt B"
function RtPickLabel(slot) {
    const name = RtPrinterName(slot);
    return `${slot}: ${name || (RtModeOf(slot) === 'png' ? 'Preview only' : slot === 1 ? 'Auto-detect' : 'not set up')}`;
}

// Is the printer set up? Printer 1 always is (it can auto-detect). The others need a printer chosen, or the preview mode, which has nothing to send to.
function RtSetUp(slot) {
    if (slot === 1) return true;
    const extra = working && working.extras[slot - 2];
    return !!extra && (!!extra.printer || extra.mode === 'png' || (RtIsStickerWifi(extra) && !!extra.vcAddress));       // 3.2.0: a sticker printer on Wi-Fi has an address in place of a queue
}

// What is wrong with a printer in the status, as { text, hard } or null. hard: it cannot print. The text is short. The preview mode has nothing that can be wrong.
function RtStatusProblem(p) {
    if (!p || p.mode === 'png') return null;
    if (p.mode === 'vc500w' && p.sticker && p.sticker.connection === 'wifi' && !p.name) return { text: 'no address', hard: true };      // 3.2.0
    if (!p.name) return { text: p.note ? 'not installed' : p.slot === 1 ? 'no printer found' : 'not set up', hard: true };
    const q = p.queue;
    if (q && (q.state === 'error' || q.state === 'stale')) return { text: q.text || 'the print queue has a problem', hard: true };
    if (p.note) return { text: p.note, hard: false };
    return null;
}

// What is wrong with the printer of a card: what the person set and what the action answered. Null when nothing is.
function RtCardProblem(slot) {
    const mode = RtModeOf(slot);
    if (mode === 'png') return null;
    if (mode === 'vc500w' && RtIsStickerWifi(slot === 1 ? Rt1Config() : working.extras[slot - 2]) && !RtPrinterName(slot)) return { text: 'no address', hard: true };      // 3.2.0
    if (slot > 1 && !RtSetUp(slot)) return { text: 'not set up', hard: true };
    const info = RtPrinterInfo(slot);
    if (!info) return null;
    if (slot > 1 && !info.name && !info.note) return null;            // the action has not answered yet for a printer that was just chosen
    return RtStatusProblem({ slot, name: info.name, note: info.note, queue: info.queue, mode });
}

// A card is open when the person opened it, or when nobody said anything and the cards start open. Every card can be closed, printer 1 as well (3.0.0-beta.4).
function RtLoadOpenState() {
    if (rtOpenState !== null) return;
    rtOpenState = {};
    try {
        const saved = JSON.parse(store.get(RT_CARDS_KEY) || '{}');
        if (isObj(saved)) for (const key of Object.keys(saved)) if (/^[0-9]{1,3}$/.test(key) && typeof saved[key] === 'boolean') rtOpenState[key] = saved[key];
    } catch (e) { }
}

function RtIsOpen(slot) {
    RtLoadOpenState();
    if (hasOwn(rtOpenState, String(slot))) return rtOpenState[String(slot)];
    return rtDefaultOpen !== false;
}

function RtSaveOpenState() { store.set(RT_CARDS_KEY, JSON.stringify(rtOpenState)); }

function RtSetOpen(slot, open) {
    RtLoadOpenState();
    rtOpenState[String(slot)] = open;
    RtSaveOpenState();
}

// A printer is taken away: the choices of the cards after it move up with their cards
function RtShiftOpen(slot) {
    RtLoadOpenState();
    const next = {};
    for (const key of Object.keys(rtOpenState)) {
        const n = parseInt(key, 10);
        if (n < slot) next[key] = rtOpenState[key];
        else if (n > slot) next[String(n - 1)] = rtOpenState[key];
    }
    rtOpenState = next;
    RtSaveOpenState();
}


// ---- small builders for the controls ------------------------------------------------------------------------------------------

// items: [value, text, disabled?] or { label, items: [...] } for a group
function RtSelect(items, current, attrs) {
    const select = h('select', attrs);
    const add = (parent, item) => {
        const o = document.createElement('option');
        o.value = item[0]; o.textContent = item[1];
        if (item[2]) o.disabled = true;
        parent.append(o);
    };
    for (const item of items) {
        if (Array.isArray(item)) add(select, item);
        else {
            const g = document.createElement('optgroup');
            g.label = item.label;
            for (const sub of item.items) add(g, sub);
            select.append(g);
        }
    }
    select.value = current;
    if (select.selectedIndex < 0 && select.options.length) select.selectedIndex = 0;
    return select;
}

// Fills a list that is already on the page with these entries ([value, text, disabled?]) and chooses one
function RtSetOptions(select, items, current) {
    select.replaceChildren(...items.map(item => {
        const o = document.createElement('option');
        o.value = item[0]; o.textContent = item[1];
        if (item[2]) o.disabled = true;
        return o;
    }));
    select.value = current;
    if (select.selectedIndex < 0 && select.options.length) select.selectedIndex = 0;
}

function RtRow(label, description, control, extraClass) {
    return h('div', { class: extraClass ? `setting ${extraClass}` : 'setting' }, h('div', null, h('div', { class: 'setting-label' }, label), description ? h('div', { class: 'setting-description' }, description) : null), control);
}

function RtFocus(el, key) { el.setAttribute('data-k', key); return el; }


// ---- editing ----------------------------------------------------------------------------------------------------------------------

// 3.2.0-beta.9 (the owner, 20 October 2026: printer 3's Allow YouTube High Roller prints was off after a reload): the page saves the whole list of the printers and the rules, and
// it keeps its own list while a control of the printer cards has the focus (PrintersRender), so a page whose list was older than the action's (another dock, or another window
// of the dock, had changed it meanwhile) wrote the older values back with its next change. An edit now starts from the action's newest list when the page holds no change of its
// own that waits (RtWaiting: that list is ahead of the action's, and is kept). When printers or rules were added, removed or moved meanwhile (another printer or rule in a place,
// RtPlaces), the change the person made may not be the one they saw: the page shows the newest list, makes no change, and says so in the line under Settings.
const RT_NEWER_TEXT = 'The printers or the rules were changed somewhere else, for example in another dock. The dock shows them as they are now: make your change again.';
const RtPlaces = (cfg) => JSON.stringify([cfg.extras.map(e => [e.printer, e.vcAddress]), cfg.routing.rules.map(r => [r.to, r.trigger])]);      // a printer by its queue or address, a rule by its printer and trigger
function RtFromNewest() {
    if (RtWaiting() || !pbStatus || !isObj(pbStatus.settings) || !hasOwn(pbStatus.settings, 'extraPrinters') || !hasOwn(pbStatus.settings, 'routing')) return true;
    const incoming = RtReadConfig(pbStatus.settings);
    if (RtCanon(incoming) === RtCanon(working)) return true;
    const same = RtPlaces(incoming) === RtPlaces(working);
    if (same) incoming.extras.forEach((e, i) => { if (working.extras[i]._vcRefused) e._vcRefused = working.extras[i]._vcRefused; });     // the sentence of a refused address stays (3.2.0-beta.8)
    working = incoming;
    if (same) return true;
    saveFailedNote = RT_NEWER_TEXT;
    clearTimeout(saveFailedTimer);
    saveFailedTimer = setTimeout(() => { saveFailedNote = ''; RenderUnsaved(); }, 15000);
    RenderUnsaved();
    rtRecs.clear(); rtRuleRecs.clear();                      // every card and rule is drawn again: the control the person used shows what the action has
    RtBuild();
    RtRefreshWords();
    return false;
}

// Records an edit. rebuild: make the cards that changed again (a change of structure or of a list), else only the words that depend on what was typed.
function RtEdit(change, rebuild) {
    if (!RtFromNewest()) return;
    change(working);
    rtRulePapers = null;                                       // 3.2.0-beta.8: the rules may have changed in place (RtRulePapers)
    RtMarkGood(working);
    rtFocusKey = rebuild && document.activeElement && document.activeElement.getAttribute ? (document.activeElement.getAttribute('data-k') || '') : '';
    const patch = RtForSaving(working);
    pendingSettings.extraPrinters = patch.extraPrinters;
    pendingSettings.routing = patch.routing;
    saveFailedNote = '';                                       // an edit starts a new try
    clearTimeout(saveTimer);
    saveTimer = setTimeout(SaveSettings, 400);
    if (rebuild) RtBuild(); else RtRefreshWords();
}

// ---- printers that may not take ESC/POS (3.0.0-beta.4) ---------------------------------------------------------------------
// ESC/POS is a command language. A printer that does not understand it prints pages of strange characters or keeps the job stuck, and the receipts behind it wait. The action says three
// things about each printer (the care part of the status): what Windows suggests about its queue, whether Printer Bot holds it back because a job does not leave its queue, and the
// answer to "Check this printer", which sends one short test line after the person asked for it. Under the printer of each card (and under printer 1 when it is alone) this block shows
// what is worth knowing, with the buttons that go with it. It is filled in place from the status and made again only when its content changed.

function RtCareBlock(slot) {
    return h('div', { class: 'care', 'data-care': String(slot), hidden: '' });
}

// What the block says and offers: { lines: [{ text, warn }], buttons: [[key, label, hint]] }, or null when there is nothing to say
function RtCareParts(slot) {
    const info = RtPrinterInfo(slot);
    const care = info && info.care;
    if (!care) return null;                                           // an action from before 3.0.0-beta.4 says nothing of this
    const mode = RtModeOf(slot);
    const lines = [], buttons = [];
    const windows = ['windows', 'Use the Windows printer driver', 'Switch this printer to the Windows printer driver, which every printer understands'];
    const check = ['check', care.check.state === 'none' ? 'Check this printer' : 'Check again', 'Sends one short line of text to this printer, and cuts the paper'];
    // An action that knows Letter paper (the status has paperSize) gets the switch that sets it as well: a printer that does not take ESC/POS is an ordinary printer, and 80 and 58 mm are rare for those
    const letterKnown = !!pbStatus && isObj(pbStatus.settings) && hasOwn(pbStatus.settings, 'paperSize');
    const windowsLetter = ['windowsLetter', 'Use the Windows printer driver on Letter paper', 'Switch this printer to the Windows printer driver and to Letter paper (8.5 x 11 in), the size of most printers that do not take ESC/POS'];
    if (care.guard.held) {
        lines.push({ text: care.guard.text || 'A receipt sent to this printer is stuck in its print queue, so it is held back.', warn: true });
        buttons.push(['clear', 'Clear stuck jobs', 'Takes the receipts Printer Bot sent out of the print queue of this printer'], ['again', 'Try again', 'Sends receipts to this printer again without clearing its queue']);
        if (mode === 'escpos') buttons.push(windows);
    } else if (mode === 'escpos') {
        const state = care.check.state;
        if (state === 'sent') {
            lines.push({ text: care.check.text || 'A test line was sent. Did the printer print it?', warn: false });
            buttons.push(['yes', 'Yes, it printed', 'The test line came out of the printer as text'], ['no', 'No', 'Nothing came out, or it came out as strange characters']);
        } else if (state === 'rejected') {
            lines.push({ text: 'You checked this printer and the test line did not print correctly. It does not take ESC/POS commands, so use the Windows printer driver for it.' + (letterKnown ? ' Most printers like that print on Letter paper (8.5 x 11 in), and the first button sets that too.' : ''), warn: true });
            buttons.push(letterKnown ? windowsLetter : windows, check);
        } else if (state === 'stuck') {
            lines.push({ text: care.check.text, warn: true });
            buttons.push(windows, check);
        } else if (state === 'failed') {
            lines.push({ text: care.check.text, warn: true });
            buttons.push(check);
        } else if (state === 'ok') {
            lines.push({ text: 'You checked this printer and the test line printed correctly.', warn: false });
            buttons.push(check);
        } else if (care.kind === 'unlikely') {
            lines.push({ text: `This printer looks like ${care.why || 'a printer that does not take ESC/POS'}. Thermal output sends ESC/POS commands, and most printers of this kind do not understand them. They print pages of strange characters or keep the job stuck, and the receipts behind it wait.`, warn: true });
            buttons.push(windows, check);
        } else {
            lines.push({ text: 'Not sure this printer takes ESC/POS? Check this printer sends one short test line and asks you whether it printed.', warn: false });
            buttons.push(check);
        }
    }
    return lines.length ? { lines, buttons } : null;
}

// The switch to the Windows printer driver is the same edit as choosing it in the list of the printer
// With letter set, the paper goes to Letter (8.5 x 11 in) as well, in the same save. That is the size of the printers that do not take ESC/POS.
function RtUseWindows(slot, letter) {
    if (slot === 1) {
        const mode = rt$('mode');
        mode.value = 'windows';
        mode.dispatchEvent(new Event('change', { bubbles: true }));
        if (letter) {
            RtRenderPaper1();                                                // the Letter entry is on now that the output is not thermal
            const paper = rt$('paperWidthMm');
            if (Array.from(paper.options).some(o => o.value === 'letter' && !o.disabled)) {
                paper.value = 'letter';
                paper.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        return;
    }
    RtEdit(w => { const e = RtExtraAt(w, slot); if (e) { e.mode = 'windows'; if (letter) e.paperSize = 'letter'; } }, true);
}

// A check goes to the printer that is on screen, so the edits that wait for their save go with it (the action takes them first, as it does for a test print)
function RtCareSend(command, slot, withEdits) {
    const extra = { slot };
    if (withEdits) {
        const unsaved = { ...pendingSettings };
        if (Object.keys(unsaved).length > 0) { SaveSettings(); extra.settingsJson = JSON.stringify(unsaved); }
    }
    return Send(command, extra);
}

// The action sends one test line to a printer in 5 seconds and ignores a click that comes sooner, so the button that sent one stays off for that long
const RT_CHECK_HOLD_MS = 5000;

function RtCareClick(key, slot, button) {
    if (key === 'windows') { RtUseWindows(slot, false); return; }
    if (key === 'windowsLetter') { RtUseWindows(slot, true); return; }
    if (button) { button.disabled = true; setTimeout(() => { button.disabled = false; }, key === 'check' ? RT_CHECK_HOLD_MS : 1500); }
    if (key === 'check') RtCareSend('checkPrinter', slot, true);
    else if (key === 'yes') Send('answerCheck', { slot, printed: true });
    else if (key === 'no') Send('answerCheck', { slot, printed: false });
    else if (key === 'clear') Send('clearStuckJobs', { slot });
    else if (key === 'again') Send('tryAgain', { slot });
}

function RtRenderCare() {
    document.querySelectorAll('.care[data-care]').forEach(el => {
        const slot = parseInt(el.getAttribute('data-care'), 10);
        const parts = slot >= 1 ? RtCareParts(slot) : null;
        const sig = JSON.stringify(parts);
        if (el._careSig === sig) return;
        el._careSig = sig;
        const hadFocus = el.contains(document.activeElement);
        el.replaceChildren();
        el.hidden = !parts;
        if (!parts) return;
        for (const line of parts.lines) el.append(h('p', { class: 'care-text' + (line.warn ? ' warn' : '') }, line.text));
        if (parts.buttons.length) {
            const row = h('div', { class: 'care-buttons' });
            for (const [key, label, hint] of parts.buttons) {
                const button = h('button', { type: 'button', class: 'small-button', title: hint, 'data-care-button': key }, label);
                button.addEventListener('click', () => RtCareClick(key, slot, button));
                row.append(button);
            }
            el.append(row);
        }
        if (hadFocus) { const first = el.querySelector('button'); if (first) first.focus(); }       // a button that was used is replaced: the focus stays in the block
    });
}

// ---- Clear print queue (3.0.0-beta.7) -----------------------------------------------------------------------------------------
// One button under each printer that has a Windows print queue (the action says so in care.queue.can). It takes every job out of that queue, also the jobs that other programs sent,
// so it needs two clicks: the first changes the label and waits RT_QUEUE_ARM_MS for the second. What the action did comes back in the status (care.queue.text) and shows for two minutes.

const RT_QUEUE_ARM_MS = 5000;
const RT_QUEUE_BUSY_MS = 1500;
const rtQueueClicks = new Map();                 // printer number -> { armedAt, sentAt, timer }

function RtQueueBlock(slot) {
    return h('div', { class: 'care care-queue', 'data-queue': String(slot), hidden: '' });
}

function RtQueueParts(slot) {
    const info = RtPrinterInfo(slot);
    const q = info && info.care && info.care.queue;
    const mode = RtModeOf(slot);
    if (!q || q.can !== true || (mode !== 'escpos' && mode !== 'windows')) return null;
    const c = rtQueueClicks.get(slot) || { armedAt: 0, sentAt: 0 };
    const now = Date.now();
    return { text: q.text, warn: q.warn, armed: c.armedAt + RT_QUEUE_ARM_MS > now, busy: c.sentAt + RT_QUEUE_BUSY_MS > now };
}

function RtQueueClick(slot) {
    const c = rtQueueClicks.get(slot) || { armedAt: 0, sentAt: 0, timer: 0 };
    rtQueueClicks.set(slot, c);
    clearTimeout(c.timer);
    const now = Date.now();
    if (c.armedAt + RT_QUEUE_ARM_MS > now) {                      // the second click: the queue is cleared
        c.armedAt = 0;
        c.sentAt = now;
        c.timer = setTimeout(RtRenderQueue, RT_QUEUE_BUSY_MS + 50);
        RtCareSend('clearQueue', slot, true);
    } else {                                                      // the first click: the button asks again
        c.armedAt = now;
        c.timer = setTimeout(RtRenderQueue, RT_QUEUE_ARM_MS + 50);
    }
    RtRenderQueue();
}

function RtRenderQueue() {
    document.querySelectorAll('.care-queue[data-queue]').forEach(el => {
        const slot = parseInt(el.getAttribute('data-queue'), 10);
        const parts = slot >= 1 ? RtQueueParts(slot) : null;
        const sig = JSON.stringify(parts);
        if (el._queueSig === sig) return;
        el._queueSig = sig;
        const hadFocus = el.contains(document.activeElement);
        el.replaceChildren();
        el.hidden = !parts;
        if (!parts) return;
        if (parts.text) el.append(h('p', { class: 'care-text' + (parts.warn ? ' warn' : '') }, parts.text));
        const button = h('button', { type: 'button', class: 'small-button', 'data-queue-button': 'clear',
            title: 'Takes every job out of the Windows print queue of this printer, also the jobs that other programs sent' }, parts.armed ? 'Delete every job in the queue? Click again' : 'Clear print queue');
        button.disabled = parts.busy;
        button.addEventListener('click', () => RtQueueClick(slot));
        el.append(h('div', { class: 'care-buttons' }, button));
        if (hadFocus) button.focus();
    });
}

function RtAddPrinter() {
    if (!working || working.extras.length >= RtLimits().printers - 1) return;
    const base = pbStatus && isObj(pbStatus.settings) ? pbStatus.settings : {};
    RtSetOpen(2 + working.extras.length, true);                   // the new printer opens, so the person can set it up
    // It takes the paper, the output and the switches of printer 1, except Allow YouTube High Roller prints (3.0.2): that one starts off on every new printer (RtCleanExtra)
    RtEdit(w => w.extras.push(RtCleanExtra({
        printer: '', paperWidthMm: base.paperWidthMm, paperSize: base.paperSize, mode: base.mode, printProfile: base.printProfile, letterLayout: base.letterLayout, letterImageFit: base.letterImageFit, allowHighRoller: base.allowHighRoller, allowImages: base.allowImages,
        dither: base.dither, cut: base.cut, feedDots: base.feedDots,
        vcConnection: base.vcConnection, vcTapeMm: base.vcTapeMm, vcQuality: base.vcQuality, vcCut: base.vcCut,            // 3.2.0: the sticker settings too, but not the address: two printers never share one
    })), true);
}

function RtRemovePrinter(slot) {
    RtShiftOpen(slot);
    RtEdit(w => {
        w.extras.splice(slot - 2, 1);
        w.routing.rules = w.routing.rules.filter(r => r.to !== slot).map(r => Object.assign({}, r, { to: r.to > slot ? r.to - 1 : r.to,
            good: r.good && r.good.to !== slot ? Object.assign({}, r.good, { to: r.good.to > slot ? r.good.to - 1 : r.good.to }) : undefined }));     // 3.2.0-beta.5: that version names its printer
        const rest = w.routing.routeAllElse;
        w.routing.routeAllElse = rest === slot ? 1 : rest > slot ? rest - 1 : rest;
        if (w.extras.length === 0) w.routing = { routeAllElse: 1, rules: [], stopAtFirstMatch: w.routing.stopAtFirstMatch };   // one printer again: no rule stays behind where nobody can see it (3.2.0-beta.5: the way the rules are read stays)
    }, true);
}

// 3.2.0-beta.5: a new rule goes to the end of the list (above the rule for everything else) with no printer until one is chosen (the owner's choice), so it routes nothing until then
function RtAddRule() {
    const limits = RtLimits();
    if (working.routing.rules.length >= limits.rules) return;
    RtEdit(w => w.routing.rules.push({ to: 0, trigger: '', when: [] }), true);
}

// ---- the order of the rules (3.2.0-beta.4; 3.2.0-beta.5: one list) ------------------------------------------------------------------------------
// The action reads the rules in the order of the list. From 3.2.0-beta.5 they are one list for every printer, the rules section, and the first rule an event passes decides its
// printer, its paper and its tray, unless the switch Do not stop at first match is on (Routing.Route, stopAtFirstMatch). A rule moves anywhere in the list: dragged by its handle,
// or with Up and Down while its handle has the focus. The rule for everything else is always the last: it is not in the list, and it does not move. The whole list is saved,
// as for every other edit.

// Moves rule `ri` (its place in the list, 0 is the first) to place `at`. Its handle has the focus afterwards.
function RtMoveRule(ri, at) {
    if (!working.routing.rules[ri] || at < 0 || at >= working.routing.rules.length || at === ri) return;
    RtEdit(w => { w.routing.rules.splice(at, 0, w.routing.rules.splice(ri, 1)[0]); }, true);
    const again = document.querySelector(`#printers-multi [data-k="mv${at}"]`);
    if (again) again.focus();
}

// The handle of a rule. Up and Down move the rule one place. A drag (the pointer moved a few pixels with the button down) moves the rule with the pointer inside the list of
// the rules, which it cannot leave; the other rules make room for it, and the rule takes the place where it is let go. Escape puts everything back as it was, and so does a
// list that changed meanwhile.
function RtHookMove(handle, el, ri) {
    handle.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && rtDrag) { ev.preventDefault(); RtDragEnd(false); return; }
        if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
        ev.preventDefault();                                              // the arrows move the rule, not the page
        const rule = working.routing.rules[ri];
        if (rtDrag || !rule) return;
        RtMoveRule(ri, ri + (ev.key === 'ArrowUp' ? -1 : 1));
    });
    handle.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0 || rtDrag || !el.parentElement || !working.routing.rules[ri]) return;
        ev.preventDefault();                                              // no text is selected while the pointer moves
        handle.focus();                                                   // a status does not build the card again while its handle has the focus (PrintersRender)
        const list = el.parentElement, scroller = rt$('content');
        const box = (e) => e.getBoundingClientRect();
        rtDrag = {
            el, list, handle, ri, pointer: ev.pointerId, y0: ev.clientY, y: ev.clientY, scroller, top0: scroller ? scroller.scrollTop : 0, moving: false, at: -1, frame: 0,
            rules: JSON.stringify(working.routing.rules), me: box(el), area: box(list), gap: parseFloat(getComputedStyle(list).rowGap) || 0,
            others: Array.from(list.children).filter(e => e !== el).map(e => ({ e, r: box(e) })),
        };
        rtDrag.from = rtDrag.others.filter(o => o.r.top < rtDrag.me.top).length;
        try { handle.setPointerCapture(ev.pointerId); } catch (e) { /* the moves still reach the page */ }
    });
}

// The pointer moved during a drag. The places are measured once, when the drag starts (in the coordinates of that moment; a scroll of the page since then is added).
function RtDragMove() {
    const d = rtDrag;
    if (!d.el.isConnected) { RtDragEnd(false); return; }
    if (!d.moving) {
        if (Math.abs(d.y - d.y0) < 4) return;                             // a click on the handle moves nothing
        d.moving = true;
        d.el.classList.add('dragging');
        d.list.classList.add('sorting');
    }
    const scrolled = (d.scroller ? d.scroller.scrollTop : 0) - d.top0;
    const t = Math.min(d.area.bottom - d.me.bottom, Math.max(d.area.top - d.me.top, d.y - d.y0 + scrolled));      // inside the list of the rules
    d.el.style.transform = `translateY(${t}px)`;
    // Its place: after the rules before it whose middle its top has not gone above, and after the rules after it whose middle its bottom has gone below. Its edges, not its middle,
    // so that a tall rule reaches the first and the last place of a list of short ones (the list holds it, and its edges reach the ends of the list)
    const top = d.me.top + t, bottom = d.me.bottom + t;
    const at = d.others.filter((o, k) => k < d.from ? top >= (o.r.top + o.r.bottom) / 2 : bottom > (o.r.top + o.r.bottom) / 2).length;
    const room = d.me.height + d.gap;
    d.others.forEach((o, k) => {
        const shift = k >= at && k < d.from ? room : k >= d.from && k < at ? -room : 0;  // the rules it passed move to the place it left
        o.e.style.transform = shift ? `translateY(${shift}px)` : '';
    });
    d.at = at;
    RtDragScroll();
}

// Near the top or the bottom of the dock the page scrolls while the pointer stays there, so a rule can reach a place that is out of sight
function RtDragScroll() {
    const d = rtDrag;
    if (!d || !d.moving || !d.scroller || d.frame) return;
    const r = d.scroller.getBoundingClientRect();
    const step = d.y < r.top + 40 ? -12 : d.y > r.bottom - 40 ? 12 : 0;
    if (!step) return;
    d.frame = requestAnimationFrame(() => {
        d.frame = 0;
        if (rtDrag !== d) return;
        const before = d.scroller.scrollTop;
        d.scroller.scrollTop += step;
        if (d.scroller.scrollTop !== before) RtDragMove();
    });
}

// The end of a drag: let go (drop) or put back (Escape, a cancelled pointer, a card that was built again, a list that changed)
function RtDragEnd(drop) {
    const d = rtDrag;
    if (!d) return;
    rtDrag = null;
    if (d.frame) cancelAnimationFrame(d.frame);
    d.list.classList.remove('sorting');
    d.el.classList.remove('dragging');
    d.el.style.transform = '';
    for (const o of d.others) o.e.style.transform = '';
    try { if (d.handle.hasPointerCapture(d.pointer)) d.handle.releasePointerCapture(d.pointer); } catch (e) { /* gone with its card */ }
    if (drop && d.moving && d.at >= 0 && d.at !== d.from && d.el.isConnected && JSON.stringify(working.routing.rules) === d.rules) RtMoveRule(d.ri, d.at);
}

function RtNewCondition(rule) {
    const fields = RtFieldsOf(rule.trigger);
    const first = fields.length ? fields[0] : null;
    const kind = first ? first.type : 'text';
    return { field: first ? first.name : '', op: RtDefaultOp(kind), value: '' };
}

function RtChangeTrigger(rule, trigger) {
    rule.trigger = trigger;
    if (RT_FAMILIES.has(trigger)) { rule.when = []; return; }            // a family has no parameters in common, so it has no conditions
    rule.when = rule.when.filter(c => c.custom || RtFieldInfo(trigger, c.field));
}

function RtChangeField(rule, cond, name) {
    if (name === RT_OTHER) { cond.custom = true; cond.field = ''; cond.op = RT_OP_KIND[cond.op] ? cond.op : 'is'; return; }
    cond.custom = false;
    cond.field = name;
    const info = RtFieldInfo(rule.trigger, name);
    const kind = info ? info.type : 'text';
    if (RT_OP_KIND[cond.op] !== kind) cond.op = RtDefaultOp(kind);
    cond.value = '';
}

function RtChangeKind(cond, kind) {
    if (RT_OP_KIND[cond.op] !== kind) { cond.op = RtDefaultOp(kind); cond.value = ''; }
}

// The controls below name their rule and condition by number (ri, ci) and their printer by number (slot), and look the object up in the working copy
// when they are used. The working copy is replaced whenever the action's settings are taken, and a card that was not built again must still edit the new one.
const RtRuleAt = (w, ri) => w.routing.rules[ri];
const RtCondAt = (w, ri, ci) => w.routing.rules[ri] ? w.routing.rules[ri].when[ci] : undefined;
const RtExtraAt = (w, slot) => w.extras[slot - 2];


// ---- building the cards -------------------------------------------------------------------------------------------------------

function RtChoiceValue(info, cond) {
    return info && info.factor && cond.value !== '' && isFinite(Number(cond.value)) ? String(Number(cond.value) / info.factor) : cond.value;
}

function RtBuildCondition(ri, ci) {
    const rule = working.routing.rules[ri];
    const cond = rule.when[ci];
    const info = RtFieldInfo(rule.trigger, cond.field);
    const custom = !!cond.custom || !info;
    const kind = info ? info.type : (RT_OP_KIND[cond.op] || 'text');
    const key = `c${ri}-${ci}`;
    const el = h('div', { class: 'cond' });
    const edit = (change, rebuild) => RtEdit(w => { const c = RtCondAt(w, ri, ci); if (c) change(c, RtRuleAt(w, ri)); }, rebuild);

    // the parameter
    const groups = [];
    for (const f of RtFieldsOf(rule.trigger)) {
        let g = groups.find(x => x.label === f.group);
        if (!g) { g = { label: f.group, items: [] }; groups.push(g); }
        g.items.push([f.name, `${f.label} (${f.name})`]);
    }
    groups.push({ label: 'Not in the list', items: [[RT_OTHER, 'Other parameter...']] });
    const field = RtFocus(RtSelect(groups, custom ? RT_OTHER : cond.field, { class: 'cond-field', 'aria-label': 'Parameter' }), key + 'f');
    field.addEventListener('change', () => edit((c, r) => RtChangeField(r, c, field.value), true));
    el.append(field);

    if (custom) {
        const name = RtFocus(h('input', { type: 'text', class: 'cond-name', maxlength: '64', placeholder: 'Variable name', 'aria-label': 'Variable name', spellcheck: 'false' }), key + 'n');
        name.value = cond.field;
        name.addEventListener('input', () => edit(c => { c.field = name.value.trim(); }, false));
        name.addEventListener('change', () => edit(c => { c.field = name.value.trim(); }, false));
        const type = RtFocus(RtSelect([['number', 'a number'], ['text', 'text'], ['flag', 'yes or no']], kind, { class: 'cond-kind', 'aria-label': 'Kind of value' }), key + 'k');
        type.addEventListener('change', () => edit(c => RtChangeKind(c, type.value), true));
        el.append(name, type);
    }

    // the test
    const ops = ROUTE_CATALOG.operators[kind];
    const op = RtFocus(RtSelect(ops.map(p => [p[0], RtOpMenuText(p)]), ops.some(p => p[0] === cond.op) ? cond.op : ops[0][0], { class: 'cond-op', 'aria-label': 'Test' }), key + 'o');
    op.addEventListener('change', () => edit(c => { c.op = op.value; if (!RtNeedsValue(c.op)) c.value = ''; }, true));
    el.append(op);

    // the value
    if (RtNeedsValue(cond.op)) {
        const limits = RtLimits();
        let value;
        if (info && info.choices) {
            const list = info.choices.map(c => [c[0], c[1]]);
            if (cond.value !== '' && !info.choices.some(c => c[0] === cond.value)) list.push([cond.value, cond.value]);
            value = RtFocus(RtSelect([['', 'Choose...']].concat(list), cond.value, { class: 'cond-value', 'aria-label': 'Value' }), key + 'v');
            value.addEventListener('change', () => edit(c => { c.value = value.value; }, true));
        } else if (kind === 'number') {
            value = RtFocus(h('input', { type: 'number', class: 'cond-value', step: 'any', 'aria-label': 'Value', placeholder: 'Number' }), key + 'v');
            value.value = RtChoiceValue(info, cond);
            const factor = info && info.factor ? info.factor : 1;
            const put = (c) => { const v = value.value.trim(); c.value = v === '' || !isFinite(Number(v)) ? '' : String(Math.round(Number(v) * factor * 1e6) / 1e6); };      // (the rounding only removes the dust of a sum such as 0.1 * 1000000)
            value.addEventListener('input', () => edit(put, false));
            value.addEventListener('change', () => edit(put, false));
        } else {
            value = RtFocus(h('input', { type: 'text', class: 'cond-value', maxlength: String(limits.valueChars), 'aria-label': 'Value', placeholder: 'Text' }), key + 'v');
            value.value = cond.value;
            value.addEventListener('input', () => edit(c => { c.value = value.value; }, false));
            value.addEventListener('change', () => edit(c => { c.value = value.value.trim(); }, false));
        }
        el.append(value);
    }

    const remove = RtFocus(h('button', { type: 'button', class: 'icon-small cond-remove', 'aria-label': 'Remove this condition', title: 'Remove this condition' }, '\xD7'), key + 'x');
    remove.addEventListener('click', () => RtEdit(w => { const r = RtRuleAt(w, ri); if (r) r.when.splice(ci, 1); }, true));
    el.append(remove);
    return el;
}

function RtBuildRule(ri) {
    const rule = working.routing.rules[ri];
    const limits = RtLimits();
    const family = RT_FAMILIES.has(rule.trigger);
    const problem = RtRuleProblem(rule);
    const el = h('div', { class: 'rule' + (problem ? ' unfinished' : '') });

    const groups = [{ label: 'Many events', items: ROUTE_CATALOG.families.map(f => [f.id, f.label]) }];
    for (const platform of ['Twitch', 'YouTube', 'Kick', 'StreamElements', 'Streamlabs', 'Fourthwall']) {
        groups.push({ label: platform, items: ROUTE_CATALOG.triggers.filter(t => t.platform === platform).map(t => [t.id, `${t.platform}: ${t.label}`]) });
    }
    const known = RT_FAMILIES.has(rule.trigger) || RT_TRIGGERS.has(rule.trigger);
    if (rule.trigger === '') groups.unshift({ label: 'Not chosen yet', items: [['', 'Pick a trigger...']] });
    else if (!known) groups.push({ label: 'Not in the list', items: [[rule.trigger, rule.trigger]] });
    const trigger = RtFocus(RtSelect(groups, rule.trigger, { 'aria-label': 'Trigger' }), `t${ri}`);
    trigger.addEventListener('change', () => RtEdit(w => { const r = RtRuleAt(w, ri); if (r) RtChangeTrigger(r, trigger.value); }, true));
    const remove = RtFocus(h('button', { type: 'button', class: 'icon-small', 'aria-label': 'Remove this rule', title: 'Remove this rule' }, '\xD7'), `rx${ri}`);
    remove.addEventListener('click', () => RtEdit(w => w.routing.rules.splice(ri, 1), true));
    const handle = RtFocus(h('button', { type: 'button', class: 'rule-handle', 'aria-label': `Move rule ${ri + 1}`, title: 'Drag to move this rule, or press Up or Down' }, h('span'), h('span'), h('span')), `mv${ri}`);     // 3.2.0-beta.4
    RtHookMove(handle, el, ri);
    // 3.2.0-beta.5: the printer of the rule, in its head beside the number (the handle before it), and its trigger on the line below
    const toList = RtFocus(h('select', { class: 'rule-printer', 'aria-label': `Printer of rule ${ri + 1}` }), `to${ri}`);
    RtFillRulePrinter(toList, rule.to);
    toList.addEventListener('change', () => RtEdit(w => { const r = RtRuleAt(w, ri); if (r) r.to = Math.round(num(toList.value)); }, true));
    el.append(h('div', { class: 'rule-head' }, handle, h('span', { class: 'rule-number' }, `Rule ${ri + 1}`), toList, remove), h('div', { class: 'rule-trigger' }, trigger));

    for (let ci = 0; ci < rule.when.length; ci++) el.append(RtBuildCondition(ri, ci));

    if (!family && rule.trigger !== '' && rule.when.length < limits.conditions) {
        const add = RtFocus(h('button', { type: 'button', class: 'small-button' }, rule.when.length === 0 ? 'Only when a parameter matches...' : 'Add a condition'), `ca${ri}`);
        add.addEventListener('click', () => RtEdit(w => { const r = RtRuleAt(w, ri); if (r) r.when.push(RtNewCondition(r)); }, true));
        el.append(h('div', { class: 'rule-actions' }, add));
    }
    const printer = RtConfigOf(rule.to);                                   // 3.2.0-beta.3: a printer on the Windows printer driver or the preview: what the rule prints on
    if (printer && (printer.mode === 'windows' || printer.mode === 'png') && rule.trigger !== '') el.append(RtBuildRulePaper(ri, rule, printer));
    el.append(h('p', { class: 'rule-summary' + (problem ? ' warn' : ''), 'data-rule': String(ri) }, RtRuleLine(rule)));
    return el;
}

// 3.2.0-beta.5: fills the list of printers of a rule: Choose a printer... while it has none, then every printer as number and name. A printer that is not set up cannot be chosen,
// unless it is the rule's already. It is filled again only when its content changed.
// 3.2.0-beta.8 (the audit of 19 October): the printers of those lists are made once for a building of the rules (RtBuildRules), not once for every rule: with 100 printers and 300
// rules that were 30,000 names and their texts at every status and every key typed in the box of a condition. rtRulePrintersNow holds them while RtBuildRules runs.
let rtRulePrintersNow = null;
function RtRulePrinters() {
    const count = 1 + working.extras.length, items = [];
    for (let slot = 1; slot <= count; slot++) items.push([String(slot), RtPickLabel(slot), !RtSetUp(slot)]);
    return { count, items, sig: JSON.stringify(items) };
}
function RtFillRulePrinter(select, to) {
    const p = rtRulePrintersNow || RtRulePrinters();
    const has = to >= 1 && to <= p.count;
    const own = has && p.items[to - 1][2];                         // the rule's own printer can be chosen while it is not set up
    const value = has ? String(to) : '0';
    const sig = JSON.stringify([p.sig, value, own]);
    if (select._rtSig === sig) return;
    select._rtSig = sig;
    let items = p.items;
    if (own) { items = items.slice(); items[to - 1] = [items[to - 1][0], items[to - 1][1], false]; }
    if (!has) items = [['0', 'Choose a printer...']].concat(items);
    RtSetOptions(select, items, value);
}

// 3.2.0-beta.5: the rules section, every rule in the order of the list. A rule is built again only when what it is built from changed: itself and its place, and of its printer
// what its row Prints on shows (the output, the paper, the tray, the trays of its driver); its list of printers is filled in place. The rule for everything else is the last row
// of the section, after Add a rule, and is filled by RtBuildElse. The switch Do not stop at first match is on while every rule is read.
function RtRuleSig(ri, rule, limits) {
    const c = RtConfigOf(rule.to), info = RtPrinterInfo(rule.to);
    return JSON.stringify([ri, rule, c ? [c.mode, c.paperSize, c.paperWidthMm, c.paperTray] : 0, info && Array.isArray(info.trays) ? [info.trays, info.traysNote || ''] : 0,
                           RtTrayKnown(), limits.conditions, limits.valueChars]);
}

function RtBuildRules(limits) {
    const wanted = [];
    rtRulePrintersNow = RtRulePrinters();
    try {
        working.routing.rules.forEach((rule, ri) => {
            const sig = RtRuleSig(ri, rule, limits);
            let rec = rtRuleRecs.get(ri);
            if (!rec || rec.sig !== sig) { rec = { el: RtBuildRule(ri), sig }; rtRuleRecs.set(ri, rec); }
            else { const list = rec.el.querySelector('select.rule-printer'); if (list) RtFillRulePrinter(list, rule.to); }
            wanted.push(rec.el);
        });
    } finally { rtRulePrintersNow = null; }
    for (const ri of Array.from(rtRuleRecs.keys())) if (ri >= working.routing.rules.length) rtRuleRecs.delete(ri);
    RtSyncChildren(rt$('rule-list'), wanted);
    const add = rt$('add-rule'), full = working.routing.rules.length >= limits.rules;
    add.disabled = full;
    if (full) add.title = `Printer Bot takes up to ${limits.rules} rules.`; else add.removeAttribute('title');
    const all = rt$('allMatches');
    if (all !== document.activeElement) all.checked = !working.routing.stopAtFirstMatch;
}

// The names the printers have now, by lower case: every printer that has a printer chosen, with the numbers that chose it
function RtNamesInUse() {
    const used = new Map();
    const add = (name, slot) => { if (!name) return; const key = name.toLowerCase(); if (!used.has(key)) used.set(key, []); used.get(key).push(slot); };
    add(RtPrinterName(1), 1);
    working.extras.forEach((e, i) => add(e.printer, i + 2));
    return used;
}

// Fills the list of printers of a card: the printers of this PC, the one chosen, and the names other printers hold are switched off. It is filled again only when its content changed.
function RtFillPrinterSelect(select, slot, used) {
    const extra = working.extras[slot - 2];
    const installed = pbStatus ? pbStatus.printer.installed : [];
    const names = installed.slice();
    if (extra.printer && !names.some(n => n.toLowerCase() === extra.printer.toLowerCase())) names.unshift(extra.printer);
    const items = [['', 'Choose a printer...']].concat(names.map(n => {
        const holders = used.get(n.toLowerCase()) || [];
        return [n, PrinterQueueLabel(n, pbStatus ? pbStatus.printer : null), holders.some(s => s !== slot) && n.toLowerCase() !== extra.printer.toLowerCase()];      // 3.2.0-beta.7: with its driver
    }));
    const sig = JSON.stringify([items, extra.printer]);
    if (select._rtSig === sig) return;
    select._rtSig = sig;
    RtSetOptions(select, items, extra.printer);
}

function RtExtraPrinterRow(slot) {
    const select = RtFocus(h('select', { 'aria-label': `Printer ${slot}` }), `p${slot}`);
    RtFillPrinterSelect(select, slot, RtNamesInUse());
    select.addEventListener('change', () => RtEdit(w => { const e = RtExtraAt(w, slot); if (e) e.printer = select.value; }, true));
    const info = RtPrinterInfo(slot);
    return RtRow('Printer', info && info.note ? info.note : '', select, 'printer-row');
}

// ---- Letter paper, the print profile and High Roller for each printer (3.0.0-beta.5) -------------------------------------------------------------
// Letter paper (8.5 x 11 in) is for the Windows printer driver and the preview: a thermal printer prints on its roll. Color is for the Windows printer driver alone. The action
// holds to the same two rules, so a file written by hand cannot get around them. The dock keeps them too: the Letter entry is off while the output is thermal, and choosing
// thermal takes a printer off Letter.

const RT_PAPER_TEXT = 'Letter paper (8.5 x 11 in) and the 4 x 6 in card (printed in landscape) work with the Windows printer driver and the preview. A thermal printer prints on its roll.';
const RT_PROFILE_TEXT = 'Color prints the receipt as it looks, with nothing shaded. Black and white shades pictures into dots.';
const RT_LAYOUT_TEXT = 'Scaled like 80 mm keeps the receipt as it is on a roll, blown up to the page: a big picture and a small box for the message. Large message puts a small picture, the amount, the name and the time at the top and the platform logo at the bottom, and gives all the space between to the message and its pictures. A list of gifted subs uses all that space too, so up to 100 names fit one page. Only High Roller cheers, High Roller Super Chats, gift subs and gifted memberships print this way; every other receipt on this printer prints Scaled like 80 mm.';
const RT_HIGH_ROLLER_TEXT = 'This printer prints High Roller cheers with their styled message and the pictures in it. Off prints them as ordinary cheers with plain text and no pictures.';

const RtIsLetter = (c) => c.paperSize === 'letter' && c.mode !== 'escpos' && c.mode !== 'vc500w';      // 3.2.0: a sticker printer prints on its tape, whatever paperSize says (the action holds to the same)
const RtIsSticker = (c) => !!c && c.mode === 'vc500w';
const RtIsStickerWifi = (c) => RtIsSticker(c) && c.vcConnection !== 'usb';
// The row Image fit shows where the large layout is on: Letter paper (RtIsLetter) and the Letter layout of that printer is Large message. The layout is the one that is shown now,
// also while its choice waits for its save (printer 1: the select, printers 2 and up: the working copy).
// 3.2.0-beta.2: a card of 4 x 6 in, printed in landscape: a page as Letter is (the Windows printer driver or the preview), with its own fixed layouts, the print profile and Image fit
const RtIsCard = (c) => c.paperSize === '4x6' && c.mode !== 'escpos' && c.mode !== 'vc500w';
const RtIsPage = (c) => RtIsLetter(c) || RtIsCard(c);
const RtIsColor = (c) => RtIsPage(c) && c.mode === 'windows' && c.printProfile === 'color';
const RtPaperText = (c) => RtIsSticker(c) ? (c.vcTapeMm > 0 ? `${c.vcTapeMm} mm tape` : 'tape from the printer') : RtIsLetter(c) ? 'Letter' : RtIsCard(c) ? '4 x 6 in' : `${c.paperWidthMm >= 70 ? 80 : 58} mm`;

// The settings of printer 1 as its controls show them now. The paper select holds '80', '58' or 'letter'. With Letter chosen the width of the roll is the one the action keeps.
function Rt1Config() {
    const paper = rt$('paperWidthMm').value;
    const kept = pbStatus && isObj(pbStatus.settings) ? num(pbStatus.settings.paperWidthMm) : 80;
    return {
        paperSize: paper === 'letter' || paper === '4x6' ? paper : 'roll', paperWidthMm: paper === 'letter' || paper === '4x6' ? kept : num(paper), mode: rt$('mode').value,
        printProfile: rt$('printProfile').value, letterLayout: rt$('letterLayout').value, dither: rt$('dither').value, allowHighRoller: rt$('allowHighRoller').checked,
        vcConnection: rt$('vcConnection').value === 'usb' ? 'usb' : 'wifi', vcAddress: rt$('vcAddress').value.trim(), vcTapeMm: RtVcTapeOf(rt$('vcTapeMm').value), vcQuality: rt$('vcQuality').value, vcCut: rt$('vcCut').value,
        paperTray: RtTrayClean(rt$('paperTray').value),                                         // 3.2.0-beta.3
    };
}

// The rows of printer 1 that follow its paper and output: the Letter entry (not for thermal output, and not for an action that does not know it), the print profile (Letter on
// the Windows printer driver), the Letter layout (Letter on the Windows printer driver or the preview, 3.0.0-beta.10), the Image fit (the same, and the layout is Large message, 3.0.0)
// and the picture style (not for a color print, which has no shading).
// A row that is hidden keeps its value: the select is still there with what the action reported, and the printers 2 and up keep the value in their entry.
function RtRenderPaper1() {
    const c = Rt1Config();
    for (const o of Array.from(rt$('paperWidthMm').options)) if (o.value === 'letter' || o.value === '4x6') o.disabled = c.mode === 'escpos' || !(pbStatus && isObj(pbStatus.settings) && hasOwn(pbStatus.settings, 'paperSize'));
    const pages = RtPapersOf(c, 1);                                                          // 3.2.0-beta.3: the pages it prints, its own and its rules'
    rt$('print-profile-row').hidden = !(pages.size > 0 && c.mode === 'windows');
    rt$('paper-tray-row').hidden = !(pages.size > 0 && c.mode === 'windows' && RtTrayKnown());   // 3.2.0-beta.3: the tray, for a page on the Windows printer driver
    if (RtTrayKnown()) RtFillTraySelect(rt$('paperTray'), 1, RtTrayClean(rt$('paperTray').value), RT_TRAY_DEFAULT);
    rt$('letter-layout-row').hidden = !pages.has('letter');
    rt$('image-fit-row').hidden = !((pages.has('letter') && RtLayoutOf(c.letterLayout) === 'message') || pages.has('4x6'));     // 3.2.0-beta.2: the card sets its pictures with Image fit too
    rt$('picture-style-row').hidden = RtIsColor(c) || RtIsSticker(c);                        // 3.2.0: a sticker prints in colour, with nothing shaded
    rt$('paperWidthMm').closest('.setting').hidden = RtIsSticker(c);                         // ... on its tape (the Tape row), not on a roll
    rt$('vc-address-row').hidden = !RtIsStickerWifi(c);                                      // the address is for Wi-Fi; USB has the printer list
    rt$('printer').closest('.setting').hidden = c.mode === 'png' || RtIsStickerWifi(c);
}

// The printers that were built in this page return the rows of printer 1 to the place they have with one printer
function RtReturnPrinterOne() {
    const single = rt$('printers-single');
    single.prepend(rt$('printer-one-more'));
    single.prepend(rt$('printer-one-main'));
    single.insertBefore(rt$('printer-one-hr'), rt$('add-printer-row'));
}

// "Allow Twitch High Roller prints" shows under every printer while High Roller is on (the box Twitch High Roller threshold (bits) holds a number above 0). When every printer has it off,
// High Roller prints nowhere, and the page says so under the box. (Its key is allowHighRoller, as before 3.0.2: only the words gained "Twitch", next to the switch for YouTube.)
// From 3.0.3 the box and that warning sit in the Twitch group of Advanced, and the summary line of a closed Advanced names the warning too (RenderAdvancedHint in app.js reads it after
// every status, through RenderOutdated, and as the box is typed in, through RenderBitsPerInchExample).
function RtHighRollerBits() {
    const n = parseInt(rt$('highRollerBits').value, 10);
    return n > 0 ? n : 0;
}

function RtRenderHighRoller() {
    const bits = RtHighRollerBits();
    document.querySelectorAll('.hr-row').forEach(el => { el.hidden = bits === 0; });
    const known = !!pbStatus && isObj(pbStatus.settings) && hasOwn(pbStatus.settings, 'allowHighRoller');
    const none = known && bits > 0 && !rt$('allowHighRoller').checked && (!working || working.extras.every(e => !e.allowHighRoller));
    const warning = rt$('high-roller-warning');
    warning.hidden = !none;
    warning.textContent = none ? `Twitch High Roller is on for cheers of ${bits} ${bits === 1 ? 'bit' : 'bits'} or more, and every printer has Allow Twitch High Roller prints turned off. Those cheers print as ordinary cheers with plain text.` : '';
    RtRenderYouTube();
    RtRenderImages();
}

// The switch of a printer in a card (printer 1 has its own, which the page moves into its card)
function RtExtraHighRoller(slot) {
    const extra = working.extras[slot - 2];
    const box = RtFocus(h('input', { type: 'checkbox', id: `allow-hr-${slot}` }), `hr${slot}`);
    box.checked = extra.allowHighRoller;
    box.addEventListener('change', () => RtEdit(w => { const e = RtExtraAt(w, slot); if (e) e.allowHighRoller = box.checked; }, true));
    const row = h('div', { class: 'setting hr-row' },
        h('div', null, h('label', { class: 'setting-label', for: `allow-hr-${slot}` }, 'Allow Twitch High Roller prints'), h('div', { class: 'setting-description' }, RT_HIGH_ROLLER_TEXT)),
        h('label', { class: 'switch' }, box, h('span', { class: 'slider' })));
    row.hidden = RtHighRollerBits() === 0;
    return row;
}

// ---- Allow YouTube High Roller prints (3.0.2) -----------------------------------------------------------------------------------------------
// A switch under every printer, next to the one for Twitch: a Super Chat of at least the YouTube High Roller threshold prints its styled message (and the pictures in it) on the printers
// that have it on, and as an ordinary Super Chat on the others. It starts off, for printer 1 and for every printer that is added. It shows while YouTube High Roller threshold (amount) is above 0,
// the way the switch for Twitch shows while Twitch High Roller threshold (bits) is. Printer 1 has the top-level setting allowYouTubeHighRoller, and the printers 2 and up have it in their own entry of
// extraPrinters (the action leaves it out of an entry that has it off, so a missing key is off). The rows have the class yt-row, and RtRenderYouTube shows and hides all of them.
const RT_YOUTUBE_TEXT = 'This printer prints Super Chats of at least the YouTube High Roller threshold with their styled message and the pictures in it. Off prints them as ordinary Super Chats with plain text and no pictures.';

const RtYouTubeKnown = () => !!pbStatus && isObj(pbStatus.settings) && hasOwn(pbStatus.settings, 'allowYouTubeHighRoller');
// The amount as the page shows it now: what is typed in the box when it is a number the page would send, else the amount in use (app.js, YouTubeAmountShown)
const RtYouTubeAmount = () => typeof YouTubeAmountShown === 'function' ? YouTubeAmountShown('youtubeHighRollerAmount') : 0;

function RtRenderYouTube() {
    const on = RtYouTubeAmount() > 0;
    document.querySelectorAll('.yt-row').forEach(el => { el.hidden = !on; });
}

// The switch of a printer in a card (printer 1 has its own, which the page moves into its card)
function RtExtraYouTube(slot) {
    const extra = working.extras[slot - 2];
    const box = RtFocus(h('input', { type: 'checkbox', id: `allow-yt-${slot}`, 'aria-describedby': `allow-yt-text-${slot}` }), `yt${slot}`);
    box.checked = extra.allowYouTubeHighRoller;
    box.disabled = !RtYouTubeKnown();
    if (box.disabled) box.title = 'The Printer Bot action is older than this dock. Update it to use this setting.';
    box.addEventListener('change', () => RtEdit(w => { const e = RtExtraAt(w, slot); if (e) e.allowYouTubeHighRoller = box.checked; }, true));
    const row = h('div', { class: 'setting yt-row' },
        h('div', null, h('label', { class: 'setting-label', for: `allow-yt-${slot}` }, 'Allow YouTube High Roller prints'), h('div', { class: 'setting-description', id: `allow-yt-text-${slot}` }, RT_YOUTUBE_TEXT)),
        h('label', { class: 'switch' }, box, h('span', { class: 'slider' })));
    row.hidden = !(RtYouTubeAmount() > 0);
    return row;
}

// ---- Allow images (3.0.0-beta.9) -----------------------------------------------------------------------------------------------------------
// "Allow images" shows under every printer while at least one image site is on (settings.imageSites is not empty), the way Allow Twitch High Roller prints shows while Twitch High Roller threshold (bits) is above 0.
// High Roller messages are the cheers and, from 3.0.2, the Super Chats that a printer prints as High Roller messages: the pictures of both follow this switch.
// A printer with it off prints a link to a picture as text (or [link], with Hide links), as it does when no site is on. Printer 1 has the top-level setting allowImages, and the printers
// 2 and up have it in their own entry of extraPrinters. The rows have the class img-row, and RtRenderImages shows and hides all of them.
const RT_IMAGES_TEXT = 'Pictures from links in High Roller messages print on this printer. Switch it off to print such links as text on this printer only.';

const RtImagesOn = () => typeof ImageSitesNow === 'function' && ImageSitesNow().length > 0;

function RtRenderImages() {
    const on = RtImagesOn();
    document.querySelectorAll('.img-row').forEach(el => { el.hidden = !on; });
}

// The switch of a printer in a card (printer 1 has its own, which the page moves into its card)
function RtExtraImages(slot) {
    const extra = working.extras[slot - 2];
    const box = RtFocus(h('input', { type: 'checkbox', id: `allow-img-${slot}`, 'aria-describedby': `allow-img-text-${slot}` }), `im${slot}`);
    box.checked = extra.allowImages;
    box.addEventListener('change', () => RtEdit(w => { const e = RtExtraAt(w, slot); if (e) e.allowImages = box.checked; }, true));
    const row = h('div', { class: 'setting img-row' },
        h('div', null, h('label', { class: 'setting-label', for: `allow-img-${slot}` }, 'Allow images'), h('div', { class: 'setting-description', id: `allow-img-text-${slot}` }, RT_IMAGES_TEXT)),
        h('label', { class: 'switch' }, box, h('span', { class: 'slider' })));
    row.hidden = !RtImagesOn();
    return row;
}

// ---- Do not cut Hype Trains (3.0.0-beta.7) -------------------------------------------------------------------------------------------------------
// A box under every printer on thermal output. With it checked the printer takes the Hype Train events too, and a Hype Train comes out of it as one strip of paper: nothing that prints on
// the printer is cut from the first Hype Train receipt to the last. The block under the box says what that means for the other receipts of the printer, what the action says about the
// train now (hypeUncut in the status), and has the button that ends the train when Printer Bot did not see its End. It is filled in place from the status.

const RT_HYPE_TEXT = 'Prints a Hype Train as one continuous receipt. Nothing on this printer is cut from the first Hype Train receipt to the last.';
const RT_HYPE_NOTE = 'Hype Trains now print on this printer. Any other receipt that prints here while a Hype Train runs, such as a YouTube event, comes out inside the Hype Train. '
    + 'To keep those off this printer, send them to other printers with rules. Or leave them here and let them ride the Hype Train.';
const RT_HYPE_BUSY_MS = 1500;
let rtHypeSentAt = 0, rtHypeTimer = 0;

const RtHypeKnown = () => !!pbStatus && isObj(pbStatus.settings) && hasOwn(pbStatus.settings, 'uncutHypeTrain');
const RtHypeOn = (slot) => slot === 1 ? rt$('uncutHypeTrain').checked : !!(working && working.extras[slot - 2] && working.extras[slot - 2].uncutHypeTrain);

// What the block under the box says: null when the box is off or the printer is not on thermal output
function RtHypeParts(slot) {
    if (RtModeOf(slot) !== 'escpos' || !RtHypeOn(slot)) return null;
    const hu = pbStatus ? pbStatus.hypeUncut : null;
    let state = '', warn = false;
    if (hu && hu.active) {
        const when = new Date(hu.since);
        state = `A Hype Train is running${isNaN(when.getTime()) ? '' : ' since ' + when.toLocaleTimeString()}. This printer does not cut until it ends.`;
    } else if (hu && hu.text) { state = hu.text; warn = hu.warn; }
    else if (hu) state = 'No Hype Train is running.';
    return { note: RT_HYPE_NOTE, state, warn, button: !!hu, busy: rtHypeSentAt + RT_HYPE_BUSY_MS > Date.now() };
}

function RtHypeClick() {
    rtHypeSentAt = Date.now();
    clearTimeout(rtHypeTimer);
    rtHypeTimer = setTimeout(RtRenderHype, RT_HYPE_BUSY_MS + 50);
    Send('resetHypeTrain');
    RtRenderHype();
}

function RtRenderHype() {
    document.querySelectorAll('.hype-row[data-hype-row]').forEach(row => { row.hidden = RtModeOf(parseInt(row.getAttribute('data-hype-row'), 10)) !== 'escpos'; });
    document.querySelectorAll('.care-hype[data-hype]').forEach(el => {
        const slot = parseInt(el.getAttribute('data-hype'), 10);
        const parts = slot >= 1 ? RtHypeParts(slot) : null;
        const sig = JSON.stringify(parts);
        if (el._hypeSig === sig) return;
        el._hypeSig = sig;
        const hadFocus = el.contains(document.activeElement);
        el.replaceChildren();
        el.hidden = !parts;
        if (!parts) return;
        el.append(h('p', { class: 'care-text' }, parts.note));
        if (parts.state) el.append(h('p', { class: 'care-text' + (parts.warn ? ' warn' : '') }, parts.state));
        if (parts.button) {
            const button = h('button', { type: 'button', class: 'small-button', 'data-hype-button': 'reset',
                title: 'Use this when a Hype Train is over and Printer Bot did not notice. It cuts the paper of the printers that have this box and brings the cuts back' }, 'Reset Hype Train');
            button.disabled = parts.busy;
            button.addEventListener('click', RtHypeClick);
            el.append(h('div', { class: 'care-buttons' }, button));
            if (hadFocus) button.focus();
        }
    });
}

// The box of a printer in a card, with the block that goes under it (printer 1 has its own, which the page moves into its card)
function RtExtraHype(slot) {
    const extra = working.extras[slot - 2];
    const box = RtFocus(h('input', { type: 'checkbox', id: `uncut-hype-${slot}` }), `hy${slot}`);
    box.checked = extra.uncutHypeTrain;
    box.disabled = !RtHypeKnown();
    if (box.disabled) box.title = 'The Printer Bot action is older than this dock. Update it to use this setting.';
    box.addEventListener('change', () => RtEdit(w => { const e = RtExtraAt(w, slot); if (e) e.uncutHypeTrain = box.checked; }, true));
    const row = h('div', { class: 'setting hype-row', 'data-hype-row': String(slot) },
        h('div', null, h('label', { class: 'setting-label', for: `uncut-hype-${slot}` }, 'Do not cut Hype Trains'), h('div', { class: 'setting-description' }, RT_HYPE_TEXT)),
        h('label', { class: 'switch' }, box, h('span', { class: 'slider' })));
    row.hidden = extra.mode !== 'escpos';
    return [row, h('div', { class: 'care care-hype', 'data-hype': String(slot), hidden: '' })];
}

// ---- Letter layout (3.0.0-beta.10) ---------------------------------------------------------------------------------------------------------
// A printer on Letter paper (not thermal output) prints the receipt scaled like an 80 mm roll (the layout of every earlier version) or as a large message: a small picture, the amount,
// the name and the time at the top, the platform logo at the bottom, and the whole space between for the message and its pictures. Printer 1 has the top-level setting letterLayout,
// and the printers 2 and up have it in their own entry of extraPrinters. The row shows exactly where the print profile row shows its Letter paper (RtIsLetter), also for the preview.

const RtLayoutKnown = () => !!pbStatus && isObj(pbStatus.settings) && hasOwn(pbStatus.settings, 'letterLayout');

// The row of a printer in a card (printer 1 has its own, which the page moves into its card). A value that is not one of the two texts shows as scaled and is sent as scaled.
function RtExtraLayout(slot) {
    const extra = working.extras[slot - 2];
    const select = RtFocus(RtSelect(RT_LAYOUTS.map(l => [l, RT_LAYOUT_NAMES[l]]), RtLayoutOf(extra.letterLayout), { id: `letter-layout-${slot}`, 'aria-describedby': `letter-layout-text-${slot}` }), `ly${slot}`);
    select.disabled = !RtLayoutKnown();
    if (select.disabled) select.title = 'The Printer Bot action is older than this dock. Update it to use this setting.';
    select.addEventListener('change', () => RtEdit(w => { const e = RtExtraAt(w, slot); if (e) e.letterLayout = RtLayoutOf(select.value); }, true));
    return h('div', { class: 'setting letter-layout-row' },
        h('div', null, h('label', { class: 'setting-label', for: `letter-layout-${slot}` }, 'Letter layout'), h('div', { class: 'setting-description', id: `letter-layout-text-${slot}` }, RT_LAYOUT_TEXT)),
        select);
}

// ---- Image fit (3.0.0) ---------------------------------------------------------------------------------------------------------------------
// How a picture in a message is set in the space that the large layout gives it: fill (covers the space and is cropped at the edges), fit (all of it is in the space, so the space can have
// margins) or stretch (exactly the size of the space, so it can look squashed or stretched). It matters for a printer whose layout is Large message on Letter paper, so the row shows there
// (and on a 4 x 6 in card) and nowhere else, and it follows the choice of the Letter layout at once, also while that choice waits for its save. A hidden row keeps its value. Printer 1 has the
// top-level setting letterImageFit, and the printers 2 and up have it in their own entry of extraPrinters.

const RT_FIT_INTRO = 'How a picture in a High Roller message is set in the space that the large layout, or a 4 x 6 in card, gives it. Every other receipt on a card is the receipt of an 80 mm roll made as large as the card allows, and Image fit does not change it. Fit is the default.';
const RT_FIT_OPTIONS = [
    ['Fill:', 'the picture is scaled until it covers all of the space and keeps its proportions, so what does not fit is cropped at the edges.'],
    ['Fit:', 'the picture is scaled until all of it fits in the space and keeps its proportions, so the space can have empty margins.'],
    ['Stretch:', 'the picture is scaled to exactly the size of the space, so nothing is cropped and there are no margins, but the picture can look squashed or stretched.'],
];
// The words under the select: one short line for the sentence and one for each of the three options, with one space between the lines, so that the text is one block of words
// (index.html holds the same words for printer 1, and the dock tests compare both with the text of the owner)
function RtFitWords() {
    const kids = [h('span', { class: 'fit-line' }, RT_FIT_INTRO)];
    for (const [name, words] of RT_FIT_OPTIONS) kids.push(' ', h('span', { class: 'fit-line' }, h('b', null, name), ' ' + words));
    return kids;
}

const RtFitKnown = () => !!pbStatus && isObj(pbStatus.settings) && hasOwn(pbStatus.settings, 'letterImageFit');

// The row of a printer in a card (printer 1 has its own, which the page moves into its card). A value that is not one of the three texts shows as fit and is sent as fit.
function RtExtraFit(slot) {
    const extra = working.extras[slot - 2];
    const select = RtFocus(RtSelect(RT_FITS.map(f => [f, RT_FIT_NAMES[f]]), RtFitOf(extra.letterImageFit), { id: `image-fit-${slot}`, 'aria-describedby': `image-fit-text-${slot}` }), `if${slot}`);
    select.disabled = !RtFitKnown();
    if (select.disabled) select.title = 'The Printer Bot action is older than this dock. Update it to use this setting.';
    select.addEventListener('change', () => RtEdit(w => { const e = RtExtraAt(w, slot); if (e) e.letterImageFit = RtFitOf(select.value); }, true));
    return h('div', { class: 'setting image-fit-row' },
        h('div', null, h('label', { class: 'setting-label', for: `image-fit-${slot}` }, 'Image fit'), h('div', { class: 'setting-description', id: `image-fit-text-${slot}` }, ...RtFitWords())),
        select);
}

function RtExtraMore(slot) {
    const extra = working.extras[slot - 2];
    const edit = (key, value, rebuild) => RtEdit(w => { const e = RtExtraAt(w, slot); if (e) e[key] = value; }, rebuild);
    const rows = [];
    if (RtIsSticker(extra)) return RtExtraSticker(slot, extra, edit);                       // 3.2.0: a sticker printer has rows of its own, and none of a roll
    const letter = RtIsLetter(extra), card = RtIsCard(extra);
    const pages = RtPapersOf(extra, slot);                                                    // 3.2.0-beta.3: the pages it prints, its own and its rules'
    const width = RtFocus(RtSelect([['80', '80 mm'], ['58', '58 mm'], ['letter', 'Letter (8.5 x 11 in)', extra.mode === 'escpos'], ['4x6', '4 x 6 in card (landscape)', extra.mode === 'escpos']], letter ? 'letter' : card ? '4x6' : (extra.paperWidthMm >= 70 ? '80' : '58'), { 'aria-label': 'Default paper size' }), `w${slot}`);
    width.addEventListener('change', () => {
        if (width.value === 'letter' || width.value === '4x6') edit('paperSize', width.value, true);
        else RtEdit(w => { const e = RtExtraAt(w, slot); if (e) { e.paperSize = 'roll'; e.paperWidthMm = parseInt(width.value, 10); } }, true);
    });
    rows.push(RtRow('Default paper size', RT_PAPER_TEXT, width));                      // 3.2.0-beta.6: Paper size until then (a rule can choose another paper)
    const mode = RtFocus(RtSelect(RT_MODES.map(m => [m, RT_MODE_NAMES[m]]), extra.mode, { 'aria-label': 'Output' }), `m${slot}`);
    mode.addEventListener('change', () => RtEdit(w => { const e = RtExtraAt(w, slot); if (e) { e.mode = mode.value; if (e.mode === 'escpos' && (e.paperSize === 'letter' || e.paperSize === '4x6')) e.paperSize = 'roll'; } }, true));
    rows.push(RtRow('Output', typeof modeText === 'function' ? modeText(extra.mode) : '', mode));
    if (pages.size > 0 && extra.mode === 'windows') {                     // color is for the Windows printer driver: a thermal printer cannot print it
        const profile = RtFocus(RtSelect(RT_PROFILES.map(p => [p, RT_PROFILE_NAMES[p]]), extra.printProfile, { 'aria-label': 'Print profile' }), `r${slot}`);
        profile.addEventListener('change', () => edit('printProfile', profile.value, true));
        rows.push(RtRow('Print profile', RT_PROFILE_TEXT, profile));
    }
    if (pages.has('letter')) rows.push(RtExtraLayout(slot));      // the layout of a Letter page: Windows printer driver or preview (a thermal printer has no Letter paper)
    if ((pages.has('letter') && RtLayoutOf(extra.letterLayout) === 'message') || pages.has('4x6')) rows.push(RtExtraFit(slot));  // how a picture is set in the large layout, and on a card (3.2.0-beta.2): only where one of them is on
    if (pages.size > 0 && extra.mode === 'windows' && RtTrayKnown()) {       // 3.2.0-beta.3: the tray of its driver that a page is taken from (after Image fit: the rows before keep their order)
        const tray = RtFocus(h('select', { 'aria-label': 'Tray' }), `tr${slot}`);
        RtFillTraySelect(tray, slot, extra.paperTray, RT_TRAY_DEFAULT);
        tray.addEventListener('change', () => edit('paperTray', RtTrayClean(tray.value), true));
        rows.push(RtRow('Tray', RT_TRAY_TEXT, tray));
    }
    if (!RtIsColor(extra)) {                                      // a color print has no shading
        const dither = RtFocus(RtSelect(RT_DITHERS.map(d => [d, RT_DITHER_NAMES[d]]), extra.dither, { 'aria-label': 'Picture style' }), `d${slot}`);
        dither.addEventListener('change', () => edit('dither', dither.value, true));
        rows.push(RtRow('Picture style', 'How avatars are turned into black and white', dither));
    }
    if (extra.mode === 'escpos') {
        const cut = RtFocus(RtSelect(RT_CUTS.map(c => [c, RT_CUT_NAMES[c]]), extra.cut, { 'aria-label': 'Paper cut' }), `u${slot}`);
        cut.addEventListener('change', () => edit('cut', cut.value, true));
        rows.push(RtRow('Paper cut', '', cut));
        const feed = RtFocus(h('input', { type: 'number', min: '0', max: '400', step: '10', 'aria-label': 'Extra feed before cut' }), `f${slot}`);
        feed.value = extra.feedDots;
        feed.addEventListener('change', () => {
            let v = parseInt(feed.value, 10);
            if (!(v > 0)) v = 0;
            if (v > 400) v = 400;
            feed.value = v;
            edit('feedDots', v, false);
        });
        rows.push(RtRow('Extra feed before cut', 'Raise this if the cut clips the last line', feed));
    }
    return rows;
}

// 3.2.0: the rows of a Brother VC-500W sticker printer (printers 2 and up): the output, the connection, the address (Wi-Fi), the tape, the quality and the cut. No paper size, no picture
// style (a sticker prints in colour) and no cut or feed of a roll.
function RtExtraSticker(slot, extra, edit) {
    const rows = [];
    const mode = RtFocus(RtSelect(RT_MODES.map(m => [m, RT_MODE_NAMES[m]]), extra.mode, { 'aria-label': 'Output' }), `m${slot}`);
    // 3.2.0-beta.8 (the audit of 19 October): the card as well as Letter goes back to the roll for a thermal printer, as in the other Output handlers (a printer that went from the driver
    // on the card to the sticker printer and then to thermal kept the card in the file)
    mode.addEventListener('change', () => RtEdit(w => { const e = RtExtraAt(w, slot); if (e) { e.mode = mode.value; if (e.mode === 'escpos' && (e.paperSize === 'letter' || e.paperSize === '4x6')) e.paperSize = 'roll'; } }, true));
    rows.push(RtRow('Output', typeof modeText === 'function' ? modeText(extra.mode) : '', mode));
    const connection = RtFocus(RtSelect(RT_VC_CONNECTIONS.map(c => [c, RT_VC_CONNECTION_NAMES[c]]), extra.vcConnection, { 'aria-label': 'Connection' }), `vc${slot}`);
    connection.addEventListener('change', () => edit('vcConnection', connection.value === 'usb' ? 'usb' : 'wifi', true));
    rows.push(RtRow('Connection', RT_VC_CONNECTION_TEXT, connection));
    if (extra.vcConnection !== 'usb') {
        const address = RtFocus(h('input', { type: 'text', maxlength: '253', spellcheck: 'false', autocomplete: 'off', placeholder: '192.168.1.50 or printer.lan', 'aria-label': 'Address' }), `va${slot}`);
        address.value = extra.vcAddress;
        // 3.2.0-beta.8: an address the dock does not keep says so in its row. The sentence is kept with the printer in the page (_vcRefused, never sent: RtExtraForSending), until
        // its address is changed again, and it is part of what the card is built from (RtCardSig), so the card shows it
        address.addEventListener('change', () => {
            const raw = address.value, a = RtVcAddressClean(raw);
            address.value = a;
            RtEdit(w => { const e = RtExtraAt(w, slot); if (e) { e.vcAddress = a; e._vcRefused = RtVcAddressRefused(raw, a); } }, true);
        });
        const addressRow = RtRow('Address', RT_VC_ADDRESS_TEXT, address);
        if (extra._vcRefused) addressRow.firstChild.appendChild(h('p', { class: 'note vc-address-note', role: 'status' }, extra._vcRefused));
        rows.push(addressRow);
    }
    const tape = RtFocus(RtSelect(RT_VC_TAPES.map(t => [String(t), RT_VC_TAPE_NAMES[t]]), String(extra.vcTapeMm), { 'aria-label': 'Tape' }), `vt${slot}`);
    tape.addEventListener('change', () => edit('vcTapeMm', RtVcTapeOf(tape.value), true));
    rows.push(RtRow('Tape', RT_VC_TAPE_TEXT, tape));
    const quality = RtFocus(RtSelect(RT_VC_QUALITIES.map(q => [q, RT_VC_QUALITY_NAMES[q]]), extra.vcQuality, { 'aria-label': 'Quality' }), `vq${slot}`);
    quality.addEventListener('change', () => edit('vcQuality', quality.value === 'normal' ? 'normal' : 'vivid', true));
    rows.push(RtRow('Quality', RT_VC_QUALITY_TEXT, quality));
    const cut = RtFocus(RtSelect(RT_VC_CUTS.map(c => [c, RT_VC_CUT_NAMES[c]]), extra.vcCut, { 'aria-label': 'Sticker cut' }), `vu${slot}`);
    cut.addEventListener('change', () => edit('vcCut', RT_VC_CUTS.includes(cut.value) ? cut.value : 'full', true));
    rows.push(RtRow('Sticker cut', RT_VC_CUT_TEXT, cut));
    return rows;
}

function RtMoreHint(slot) {
    const cfg = slot === 1 ? Rt1Config() : working.extras[slot - 2];
    if (RtIsSticker(cfg)) return `${RtPaperText(cfg)} \xB7 ${RT_MODE_SHORT.vc500w} (${RT_VC_CONNECTION_NAMES[cfg.vcConnection] || 'Wi-Fi'}) \xB7 ${RT_VC_QUALITY_NAMES[cfg.vcQuality] || 'Vivid'}`;
    return `${RtPaperText(cfg)} \xB7 ${RT_MODE_NAMES[cfg.mode] || cfg.mode} \xB7 ${RtIsColor(cfg) ? RT_PROFILE_NAMES.color : (RT_DITHER_NAMES[cfg.dither] || cfg.dither)}`;
}

// The number of rules that send to each printer, by printer number
function RtRuleCounts() {
    const counts = new Array(2 + working.extras.length).fill(0);
    for (const r of working.routing.rules) if (r.to >= 1 && r.to < counts.length) counts[r.to] += 1;
    return counts;
}

// The facts of a collapsed card, after the name: the paper, the output and the rules. The output is left out for the preview mode, which the name already says.
function RtFacts(slot, counts) {
    const extra = slot === 1 ? Rt1Config() : working.extras[slot - 2];       // printer 1 has controls of its own
    const n = counts[slot] || 0;
    const parts = [RtPaperText(extra)];
    if (extra.mode !== 'png') parts.push(RtIsSticker(extra) ? `${RT_MODE_SHORT.vc500w} (${RT_VC_CONNECTION_NAMES[extra.vcConnection] || 'Wi-Fi'})` : (RT_MODE_SHORT[extra.mode] || extra.mode));
    if (RtIsPage(extra) && extra.mode === 'windows') parts.push(RtIsColor(extra) ? 'color' : 'black and white');
    if (extra.mode === 'windows' && extra.paperTray && RtPapersOf(extra, slot).size > 0) parts.push(extra.paperTray);       // 3.2.0-beta.3
    parts.push(n === 0 ? 'no rules' : n === 1 ? '1 rule' : `${n} rules`);
    return parts.join(' \xB7 ');
}

function RtProblemMarker(problem) {
    return h('span', { class: 'printer-card-problem' + (problem.hard ? '' : ' soft'), title: problem.text }, 'Needs attention');
}

// The head of a card: the title (a button that opens and closes the card), the name, the facts of a collapsed card, the marker of a problem,
// and the tag and Remove. Remove is hidden while the card is collapsed, and printer 1 has none.
function RtBuildHead(slot, counts) {
    const open = RtIsOpen(slot);
    const head = h('div', { class: 'printer-card-head' });
    const title = h('h3', { class: 'printer-card-title' });
    const toggle = RtFocus(h('button', { type: 'button', class: 'printer-card-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': `printer-content-${slot}` }, `Printer ${slot}`), `tg${slot}`);
    toggle.addEventListener('click', () => RtToggle(slot));
    title.append(toggle);
    head.append(title, h('span', { class: 'printer-card-name muted' }, RtCardName(slot)));
    head.append(h('span', { class: 'printer-card-facts muted' }, RtFacts(slot, counts)));
    const problem = RtCardProblem(slot);
    if (problem) head.append(RtProblemMarker(problem));
    // The tag and Remove are one group. When the line is too short for the title, the name and the group, the group goes to the next line as a whole.
    const tools = h('div', { class: 'printer-card-tools' });
    if (working.routing.routeAllElse === slot) tools.append(h('span', { class: 'printer-card-else' }, 'Everything else'));
    if (slot > 1) {
        const armed = rtArmed === slot;
        const remove = RtFocus(h('button', { type: 'button', class: 'small-button printer-card-remove' + (armed ? ' confirming' : ''), 'aria-label': `Remove printer ${slot}` }, armed ? 'Sure? Remove' : 'Remove'), `rp${slot}`);
        remove.addEventListener('click', () => {
            if (rtArmed === slot) { rtArmed = 0; clearTimeout(rtArmTimer); RtRemovePrinter(slot); return; }
            rtArmed = slot;
            rtFocusKey = `rp${slot}`;
            clearTimeout(rtArmTimer);
            rtArmTimer = setTimeout(() => { rtArmed = 0; RtBuild(); }, 5000);
            RtBuild();
        });
        tools.append(remove);
    }
    if (tools.children.length > 0) head.append(tools);
    return head;
}

// The content of a card: the settings of the printer (3.2.0-beta.5: its rules are in the rules section). It is built when the card is first open.
function RtBuildContent(slot) {
    const frag = document.createDocumentFragment();
    const body = h('div', { class: 'printer-body' });
    const more = h('details', { class: 'advanced printer-more', 'data-more': String(slot) });
    const hint = h('span', { class: 'printer-more-hint muted' }, RtMoreHint(slot));
    more.append(h('summary', null, 'Paper and output', hint));
    const moreBody = h('div', { class: 'printer-more-body' });
    if (slot === 1) {
        rt$('printer-one-main').hidden = false;
        rt$('printer-one-more').hidden = false;
        rt$('printer-one-hr').hidden = false;
        body.append(rt$('printer-one-main'));
        moreBody.append(rt$('printer-one-more'));
    } else {
        if (working.extras[slot - 2].mode !== 'png' && !RtIsStickerWifi(working.extras[slot - 2])) body.append(RtExtraPrinterRow(slot));         // the preview mode has no printer to choose, and a sticker printer on Wi-Fi has an address (3.2.0)
        body.append(RtCareBlock(slot));
        body.append(RtQueueBlock(slot));
        for (const row of RtExtraMore(slot)) moreBody.append(row);
    }
    more.append(moreBody);
    body.append(more);
    if (slot === 1) body.append(rt$('printer-one-hr'));
    else { body.append(RtExtraHighRoller(slot)); body.append(RtExtraYouTube(slot)); body.append(RtExtraImages(slot)); }
    if (slot > 1) for (const el of RtExtraHype(slot)) body.append(el);
    frag.append(body);

    // 3.2.0-beta.5: the rules of the printer, and the printer for everything else, are in the rules section (RtBuildRules, RtBuildElse). What they mean for this printer stays
    // on its card, in a note at its foot, as the rules part of the card said it until then (the owner: everything of the card but the rules stays)
    const ready = RtSetUp(slot), rest = working.routing.routeAllElse === slot, own = working.routing.rules.some(r => r.to === slot);
    let note = '', warn = false;
    if (!ready && rest) { note = 'Choose a printer first. Until then, everything else prints on printer 1.'; warn = true; }
    else if (!ready) { note = 'Choose a printer first. A printer that is not set up takes no receipts.'; warn = true; }
    else if (!own && rest) note = 'No rules. This printer prints everything the other printers do not take.';
    else if (!own) { note = 'No rules, so nothing prints here. Add a rule for it under Rules, or choose it for everything else.'; warn = true; }
    else if (rest) note = 'This printer also prints every event that no rule names.';
    if (note) frag.append(h('p', { class: 'routing-empty' + (warn ? ' warn' : '') }, note));
    return frag;
}

function RtFillContent(rec, slot) {
    rec.content.append(RtBuildContent(slot));
    rec.built = true;
    if (slot === 1) rtMoved = true;                   // the rows of printer 1 are in this card now
}

// Makes the card of a printer. The old card of the number (when there is one) gives its "Paper and output" back to the new one as it was left.
function RtMakeCard(slot, sig, old, counts) {
    if (slot === 1 && rtMoved) {
        RtReturnPrinterOne();                             // the rows of printer 1 go back to their place, so that the card that is thrown away does not take them along
        rtMoved = false;
    }
    let moreOpen = null;
    if (old && old.built) { const d = old.el.querySelector('details[data-more]'); if (d) moreOpen = d.open; }
    const open = RtIsOpen(slot);
    const el = h('section', { class: 'printer-card' + (open ? '' : ' collapsed'), 'data-slot': String(slot) });
    el.append(RtBuildHead(slot, counts));
    const content = h('div', { class: 'printer-card-content', id: `printer-content-${slot}` });
    content.hidden = !open;
    el.append(content);
    const rec = { el, sig, content, built: false };
    if (open) {
        RtFillContent(rec, slot);
        if (moreOpen !== null) { const d = el.querySelector('details[data-more]'); if (d) d.open = moreOpen; }
    }
    return rec;
}

// Opens or closes a card. Nothing is built again: a card that is opened for the first time builds its content.
function RtToggle(slot) {
    const rec = rtRecs.get(slot);
    if (!rec) return;
    const open = !RtIsOpen(slot);
    RtSetOpen(slot, open);
    RtApplyOpen(rec, slot);
    RtSyncPrinterSelects();
    RtRenderToolbar();
}

function RtApplyOpen(rec, slot) {
    const open = RtIsOpen(slot);
    rec.el.classList.toggle('collapsed', !open);
    const toggle = rec.el.querySelector('.printer-card-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    rec.content.hidden = !open;
    if (open && !rec.built) RtFillContent(rec, slot);
    if (!open && rtArmed === slot) { rtArmed = 0; clearTimeout(rtArmTimer); RtBuild(); }      // a card that is closed is not waiting for a second click on Remove
}


// ---- the section ---------------------------------------------------------------------------------------------------------------------

// What a card is made from: its printer, whether it is the printer for everything else, what the action says about it, the papers its rules name (3.2.0-beta.5: they decide rows
// of the card, RtExtraMore; the rules themselves are in the rules section) and how many rules choose it (its line of facts, and its note when there is none), and the few numbers that decide a row. A card is made again only when this text differs. The lists of
// printers are not part of it: they are filled in place.
function RtCardSig(slot, papersBySlot, counts) {
    const info = RtPrinterInfo(slot);
    return JSON.stringify([
        slot, slot > 1 ? working.extras[slot - 2] : 0, working.routing.routeAllElse === slot, papersBySlot.get(slot) || [], counts[slot] || 0,
        info ? [info.name, info.note, info.queue ? [info.queue.state, info.queue.text] : 0] : 0,
        rtArmed === slot, RtLayoutKnown(), RtFitKnown(), RtYouTubeKnown(),
    ]);
}

// Puts the cards in the list in this order. A card that is already there stays where it is (it keeps its focus and its content).
function RtSyncChildren(parent, wanted) {
    const keep = new Set(wanted);
    for (let n = parent.firstChild; n;) { const next = n.nextSibling; if (!keep.has(n)) parent.removeChild(n); n = next; }
    let ref = parent.firstChild;
    for (const el of wanted) {
        if (ref === el) { ref = ref.nextSibling; continue; }
        parent.insertBefore(el, ref);
    }
}

function RtBuild() {
    if (!working || !pbStatus) return;
    rtOneHeld = rt$('paperWidthMm') ? Rt1Config() : null;               // 3.2.0-beta.4: before a card takes printer 1's controls out of the document
    const multi = working.extras.length > 0;
    const single = rt$('printers-single'), many = rt$('printers-multi');
    many.hidden = !multi;
    rt$('add-printer-row').hidden = multi;
    const limits = RtLimits();
    rt$('add-printer-description').textContent = `Print on up to ${limits.printers} printers at once, and choose which events print where.`;

    // the rows of printer 1 are in its card, or back in their place
    if (!multi) {
        if (rtMoved) { RtReturnPrinterOne(); rtMoved = false; }
        rt$('printer-one-main').hidden = false;
        rt$('printer-one-more').hidden = false;
        rt$('printer-one-hr').hidden = false;
        rt$('printer-cards').replaceChildren();
        rtRecs.clear();
        rtRuleRecs.clear();                      // 3.2.0-beta.5: one printer has no rules
        rt$('rule-list').replaceChildren();
        rtDefaultOpen = null;                    // the next list of printers decides again whether its cards start open
        RtRenderTestTargets();
        RtRenderCare();
        RtRenderQueue();
        RtRenderHype();
        RtRenderPaper1();
        RtRenderHighRoller();
        return;
    }
    if (rtDefaultOpen === null) rtDefaultOpen = working.extras.length <= RT_OPEN_CARDS;
    const count = 1 + working.extras.length;
    const papersBySlot = new Map();                                     // 3.2.0-beta.5: the papers the rules of each printer name (RtCardSig)
    for (const r of working.routing.rules) if (r.paperSize) { const list = papersBySlot.get(r.to) || []; if (!list.includes(r.paperSize)) list.push(r.paperSize); papersBySlot.set(r.to, list.sort()); }
    const counts = RtRuleCounts();
    const wanted = [];
    for (let slot = 1; slot <= count; slot++) {
        const sig = RtCardSig(slot, papersBySlot, counts);
        let rec = rtRecs.get(slot);
        if (!rec || rec.sig !== sig) { rec = RtMakeCard(slot, sig, rec, counts); rtRecs.set(slot, rec); }
        wanted.push(rec.el);
    }
    for (const slot of Array.from(rtRecs.keys())) if (slot > count) rtRecs.delete(slot);
    RtSyncChildren(rt$('printer-cards'), wanted);
    // The rows of printer 1 belong in its card. While that card is closed and has never been opened they wait where they were, so they are kept out of sight (the controls
    // stay, and the status still fills them in).
    rt$('printer-one-main').hidden = !rtMoved;
    rt$('printer-one-more').hidden = !rtMoved;
    rt$('printer-one-hr').hidden = !rtMoved;
    RtBuildRules(limits);                                               // 3.2.0-beta.5: the rules section, with the cards in the page

    // below the cards
    const canAdd = working.extras.length < limits.printers - 1;
    const addButton = rt$('add-printer-button-multi');
    const reason = `Printer Bot takes up to ${limits.printers} printers. Remove one to add another.`;
    addButton.disabled = !canAdd;
    if (canAdd) addButton.removeAttribute('title'); else addButton.title = reason;
    rt$('add-printer-row-multi').hidden = false;
    rt$('add-printer-note').textContent = canAdd ? `Up to ${limits.printers} printers.` : reason;
    RtSyncPrinterSelects();
    RtBuildElse();
    RtBuildCheck();
    RtRenderTestTargets();
    RtRenderToolbar();
    RtRenderCare();
    RtRenderQueue();
    RtRenderHype();
    RtRenderPaper1();
    RtRenderHighRoller();
    // The control that had the focus when the person used it comes back to the card that was made again. Once only, and only when the focus is nowhere else.
    const key = rtFocusKey;
    rtFocusKey = '';
    if (key && (!document.activeElement || document.activeElement === document.body)) {
        const again = document.querySelector(`#printers-multi [data-k="${key}"]`);
        if (again) again.focus();
    }
}

// The list of printers in each card that is built: filled again when the printers of the PC or the names the printers hold changed
function RtSyncPrinterSelects() {
    if (!working) return;
    let used = null;
    for (const [slot, rec] of rtRecs) {
        if (slot < 2 || !rec.built) continue;
        const select = rec.el.querySelector(`select[data-k="p${slot}"]`);
        if (!select || !working.extras[slot - 2]) continue;
        if (!used) used = RtNamesInUse();
        RtFillPrinterSelect(select, slot, used);
    }
}

function RtBuildElse() {
    const count = 1 + working.extras.length;
    const items = [];
    for (let slot = 1; slot <= count; slot++) items.push([String(slot), RtPickLabel(slot), !RtSetUp(slot)]);
    const value = String(working.routing.routeAllElse);
    const select = rt$('route-else');
    const sig = JSON.stringify([items, value]);
    if (sig !== rtElseSig) { rtElseSig = sig; RtSetOptions(select, items, value); }
    const rest = working.routing.routeAllElse;
    const warning = rt$('route-else-warning');
    warning.hidden = RtSetUp(rest);
    warning.textContent = RtSetUp(rest) ? '' : `Printer ${rest} is not set up, so everything else prints on printer 1 until you choose a printer for it.`;
}

// The words under the rules change as the person types, without building the cards again
function RtRefreshWords() {
    RtRenderPaper1();
    RtRenderHighRoller();
    RtRenderHype();
    if (!working) return;
    document.querySelectorAll('#rule-list .rule-summary').forEach(p => {
        const rule = working.routing.rules[parseInt(p.getAttribute('data-rule'), 10)];
        if (!rule) return;
        const problem = RtRuleProblem(rule);
        p.textContent = RtRuleLine(rule);
        p.classList.toggle('warn', !!problem);
        p.closest('.rule').classList.toggle('unfinished', !!problem);
    });
    document.querySelectorAll('#printer-cards .printer-more-hint').forEach(s => { s.textContent = RtMoreHint(parseInt(s.closest('details').getAttribute('data-more'), 10)); });
    const counts = RtRuleCounts();
    for (const [slot, rec] of rtRecs) {
        const head = rec.el.firstChild;
        if (!head) continue;
        const name = head.querySelector('.printer-card-name');
        if (name) name.textContent = RtCardName(slot);
        const facts = head.querySelector('.printer-card-facts');
        if (facts && (slot === 1 || working.extras[slot - 2])) facts.textContent = RtFacts(slot, counts);
        const problem = RtCardProblem(slot);
        const marker = head.querySelector('.printer-card-problem');
        if (!problem && marker) marker.remove();
        else if (problem && !marker) (facts || name).after(RtProblemMarker(problem));
        else if (problem) { marker.title = problem.text; marker.classList.toggle('soft', !problem.hard); }
    }
    RtRenderCare();
    RtRenderQueue();
}

// Called with every status. Takes the action's printers and rules when nothing of the person's is waiting.
function PrintersRender(s) {
    const supported = hasOwn(s.settings, 'extraPrinters') && hasOwn(s.settings, 'routing');
    for (const id of ['add-printer-button', 'add-printer-button-multi']) {
        rt$(id).disabled = !supported;
        if (supported) rt$(id).removeAttribute('title'); else rt$(id).title = 'The Printer Bot action is older than this dock. Update it to use more than one printer.';
    }
    if (!supported) { working = RtReadConfig({}); RtBuild(); RtRenderPaper1(); RtRenderHighRoller(); return; }
    const incoming = RtReadConfig(s.settings);
    const active = document.activeElement;
    const typing = !!active && !!active.closest && !!active.closest('#printers-multi') && !active.closest('#printers-toolbar') && /^(INPUT|SELECT|BUTTON)$/.test(active.tagName);
    if (working === null || (!RtWaiting() && !typing && RtCanon(working) !== RtCanon(incoming))) working = incoming;
    if (typing && rtRecs.size > 0) RtRefreshWords();
    else { RtBuild(); RtRefreshWords(); }
}

// Printer 1's output, paper or tray changed in its rows. 3.2.0-beta.4: its card is built again when that changes what its rules show (RtCardSig), and the control the person used keeps
// the focus: it is one of printer 1's rows, which the new card takes over as they are (moving it took the focus away).
function PrintersUpdateMore() {
    if (!working) return;
    const used = document.activeElement;
    RtBuild();
    if (used && used !== document.body && used.isConnected && document.activeElement !== used) used.focus({ preventScroll: true });
    RtRefreshWords();
}


// ---- the toolbar above many cards -----------------------------------------------------------------------------------------------

// Shown with more than five extra printers: open all, close all, a box that finds a printer by its number or its name, and how many printers need a look
function RtRenderToolbar() {
    const bar = rt$('printers-toolbar');
    const show = !!working && working.extras.length > RT_OPEN_CARDS;
    bar.hidden = !show;
    if (!show) { rt$('cards-find').value = ''; RtApplyFilter(); return; }          // without the box no card stays hidden by a word that was typed in it
    let needing = 0;
    for (const slot of rtRecs.keys()) if (RtCardProblem(slot)) needing++;
    const line = rt$('cards-attention');
    line.hidden = needing === 0;
    line.textContent = needing === 1 ? '1 printer needs attention' : `${needing} printers need attention`;
    RtApplyFilter();
}

function RtApplyFilter() {
    const query = rt$('cards-find').value.trim().toLowerCase();
    let shown = 0;
    for (const [slot, rec] of rtRecs) {
        const hit = !query || (/^[0-9]+$/.test(query) && slot === parseInt(query, 10)) || RtPrinterName(slot).toLowerCase().includes(query) || RtCardName(slot).toLowerCase().includes(query);
        rec.el.hidden = !hit;
        if (hit) shown++;
    }
    rt$('cards-none').hidden = shown > 0 || !query;
}

function RtSetAllOpen(open) {
    if (!working) return;
    RtLoadOpenState();
    for (let slot = 1; slot <= 1 + working.extras.length; slot++) rtOpenState[String(slot)] = open;
    RtSaveOpenState();
    for (const [slot, rec] of rtRecs) RtApplyOpen(rec, slot);
    RtSyncPrinterSelects();
    RtRenderToolbar();
}


// ---- the Test card and the status ---------------------------------------------------------------------------------------------

function RtRenderTestTargets() {
    const row = rt$('test-printers-row');
    const multi = !!working && working.extras.length > 0;
    row.hidden = !multi;
    rt$('test-rules-row').hidden = !multi;                 // with one printer there is nothing for the rules to choose
    rt$('test-printers').disabled = multi && rt$('test-rules').checked;           // the rules choose the printers, so the list is not used
    if (!multi) { rtTestSig = ''; return; }
    const items = [];
    for (let slot = 1; slot <= 1 + working.extras.length; slot++) items.push([String(slot), RtPickLabel(slot), !RtSetUp(slot)]);
    items.push(['all', 'All printers']);
    const sig = JSON.stringify(items);
    if (sig === rtTestSig) return;
    rtTestSig = sig;
    const select = rt$('test-printers');
    const keep = select.value;
    RtSetOptions(select, items, keep && items.some(i => i[0] === keep && !i[2]) ? keep : '1');
}

// Does the test print follow the rules (3.0.0-beta.4)? Only with more than one printer: with one there is nothing to choose
function PrintersTestFollowsRules() {
    return !!working && working.extras.length > 0 && !rt$('test-rules-row').hidden && rt$('test-rules').checked;
}

// The person switched Follow the rules: the list Print on goes grey or comes back
function PrintersTestRulesChanged() { RtRenderTestTargets(); }

// The value of "printers" for the testPrint command: nothing with one printer, else the text all or the number of one printer
function PrintersTestTarget() {
    if (!working || working.extras.length === 0 || rt$('test-printers-row').hidden) return undefined;
    const v = rt$('test-printers').value;
    return v === 'all' ? 'all' : String(parseInt(v, 10) || 1);
}

// Numbers for the Last print row: "printer 3", "printers 1 and 3", "printers 1, 2 and 3", and for many "printers 1, 2, 3, 4, 5 and 95 more"
function PrintersLastText(to) {
    if (!Array.isArray(to) || to.length === 0) return '';
    if (to.length === 1) return 'printer ' + to[0];
    if (to.length <= RT_LAST_SHOWN) return 'printers ' + to.slice(0, -1).join(', ') + ' and ' + to[to.length - 1];
    return 'printers ' + to.slice(0, RT_LAST_SHOWN).join(', ') + ' and ' + (to.length - RT_LAST_SHOWN) + ' more';
}

// Rows for the status card when there is more than one printer. Returns null with one. With up to five printers each has a row. With more there is one row that
// says how many cannot print, with a list (closed until opened) of just those.
function PrintersStatusRows(s) {
    const list = Array.isArray(s.printers) ? s.printers : [];
    if (list.length < 2) return null;
    if (list.length > RT_STATUS_ROWS) {
        const bad = [];
        for (const p of list) { const problem = RtStatusProblem(p); if (problem && problem.hard) bad.push([p, problem]); }
        const kids = [h('span', null, `${list.length} printers, ${bad.length === 0 ? 'all can print' : bad.length + ' cannot print'}`)];
        if (bad.length > 0) {
            const lines = bad.map(([p, problem]) => {
                const q = p.queue;
                const why = !p.name ? (p.note || problem.text) : (q && q.text) || problem.text;
                return h('li', null, `Printer ${p.slot}${p.name ? ' (' + p.name + ')' : ''}: ${why}`);
            });
            const details = h('details', { class: 'status-problems' }, h('summary', null, bad.length === 1 ? 'Show the printer that cannot print' : `Show the ${bad.length} printers that cannot print`), h('ul', { class: 'status-problem-list' }, ...lines));
            details.open = rtStatusOpen;
            details.addEventListener('toggle', () => { rtStatusOpen = details.open; });
            kids.push(details);
        }
        return [['Printers', h('span', { class: 'status-printers' }, ...kids)]];
    }
    const rows = [];
    for (const p of list) {
        const png = p.mode === 'png';
        const q = p.queue;
        const queueBad = !png && !!p.name && !!q && (q.state === 'error' || q.state === 'stale');
        const text = png ? 'preview only' : p.name ? p.name + (p.auto ? ' (auto-detected)' : '') : (p.note || (p.slot === 1 ? 'none found' : 'not set up'));
        const kids = [h('span', null, text)];
        if (queueBad) kids.push(h('span', { class: 'queue-' + q.state }, ' \xB7 ' + (q.text || 'the print queue has a problem')));
        rows.push([`Printer ${p.slot}`, h('span', null, ...kids)]);
    }
    return rows;
}

// The sentence of one printer that cannot print, or ''
function RtProblemSentence(p) {
    if (p.mode === 'png') return '';
    if (p.mode === 'vc500w' && p.sticker && p.sticker.connection === 'wifi' && !p.name) return `Printer ${p.slot} is a sticker printer with no address. Give its address below.`;      // 3.2.0
    if (!p.name) return p.slot === 1 ? 'No printer found for printer 1. Install your receipt printer, or pick one below.' : `Printer ${p.slot} is ${p.note ? 'not installed' : 'not set up'}. Pick a printer for it below.`;
    const q = p.queue;
    if (q && (q.state === 'error' || q.state === 'stale')) return `Printer ${p.slot}: ${q.text || 'the print queue has a problem.'}`;
    return '';
}

// A sentence for the status line when one of the printers cannot print, or '' when all can. With several it names the first and counts the others.
function PrintersProblem(s) {
    const list = Array.isArray(s.printers) ? s.printers : [];
    if (list.length < 2) return '';
    let first = '', count = 0;
    for (const p of list) {
        const sentence = RtProblemSentence(p);
        if (!sentence) continue;
        if (!first) first = sentence;
        count++;
    }
    return count > 1 ? `${first} ${count - 1} more ${count === 2 ? 'printer cannot' : 'printers cannot'} print either.` : first;
}


// ---- the route check ---------------------------------------------------------------------------------------------------------------

function RtBuildCheck() {
    let select = rt$('check-trigger');
    if (!select.options.length) {
        const groups = [];
        for (const platform of ['Twitch', 'YouTube', 'Kick', 'StreamElements', 'Streamlabs', 'Fourthwall']) {
            groups.push({ label: platform, items: ROUTE_CATALOG.triggers.filter(t => t.platform === platform).map(t => [t.id, `${t.platform}: ${t.label}`]) });
        }
        const fresh = RtSelect(groups, 'TwitchCheer', { id: 'check-trigger' });
        select.replaceWith(fresh);
        fresh.addEventListener('change', () => { RtBuildCheck(); });
        select = fresh;
    }
    const trigger = select.value;
    const seen = new Map();
    for (const rule of working.routing.rules) {
        if (!RtTriggerMatches(rule.trigger, trigger)) continue;
        for (const c of rule.when) if (RT_FIELD_NAME.test(c.field) && !seen.has(c.field)) seen.set(c.field, { rule, cond: c });
    }
    // 3.0.9: a rule tests the amount of a Super Chat or Super Sticker in the streamer's currency, so the check asks for the currency it was paid in too (empty: the YouTube currency)
    if (RT_YOUTUBE_MONEY.includes(trigger) && seen.has('microAmount') && !seen.has('currencyCode')) seen.set('currencyCode', { rule: seen.get('microAmount').rule, cond: { field: 'currencyCode', op: 'is', value: '' } });
    const sig = JSON.stringify([trigger, Array.from(seen, ([name, use]) => [name, RtKindOf(use.rule, use.cond)])]);
    if (sig === rtCheckSig) return;                      // the boxes are what they were: the person's typing in them stays
    rtCheckSig = sig;
    const box = rt$('check-fields');
    const kids = [];
    if (seen.size === 0) kids.push(h('p', { class: 'hint' }, 'No rule tests a parameter of this trigger, so the answer does not depend on any value.'));
    for (const [name, use] of seen) {
        const info = RtFieldInfo(trigger, name);
        const kind = RtKindOf(use.rule, use.cond);
        let control;
        if (info && info.choices) control = RtSelect([['', '(not given)']].concat(info.choices.map(c => [c[0], c[1]])), rtCheckValues[name] || '', { 'aria-label': name });
        else if (kind === 'flag') control = RtSelect([['', '(not given)'], ['true', 'yes'], ['false', 'no']], rtCheckValues[name] || '', { 'aria-label': name });
        else control = h('input', { type: kind === 'number' ? 'number' : 'text', step: 'any', 'aria-label': name, placeholder: kind === 'number' ? 'Number' : name === 'currencyCode' && RT_YOUTUBE_MONEY.includes(trigger) ? 'Your YouTube currency' : 'Text' });
        if (control.tagName === 'INPUT') control.value = rtCheckValues[name] !== undefined ? rtCheckValues[name] : '';
        control.addEventListener('input', () => { rtCheckValues[name] = control.value; });
        control.addEventListener('change', () => { rtCheckValues[name] = control.value; });
        control.setAttribute('data-field', name);
        control.setAttribute('data-factor', String(info && info.factor ? info.factor : 1));
        kids.push(RtRow(info ? info.label : name, name, control));
    }
    box.replaceChildren(...kids);
}

function RtTriggerMatches(pattern, key) {
    if (pattern === '*') return true;
    if (pattern.length > 1 && pattern.endsWith('*')) return key.toLowerCase().startsWith(pattern.slice(0, -1).toLowerCase());
    return pattern.toLowerCase() === key.toLowerCase();
}

function RtCheck() {
    const trigger = rt$('check-trigger').value;
    const values = {};
    document.querySelectorAll('#check-fields [data-field]').forEach(c => {
        const v = c.value.trim();
        if (v === '') return;
        const factor = Number(c.getAttribute('data-factor')) || 1;
        values[c.getAttribute('data-field')] = factor !== 1 && isFinite(Number(v)) ? String(Math.round(Number(v) * factor)) : v;
    });
    if (RT_YOUTUBE_MONEY.includes(trigger) && values.microAmount !== undefined && values.currencyCode === undefined) {      // an amount with no currency given is in the YouTube currency
        const own = document.getElementById('localCurrency');
        if (own && /^[A-Z]{3}$/.test(own.value)) values.currencyCode = own.value;
    }
    rtCheckId += 1;
    const result = rt$('check-result');
    result.hidden = false;
    result.textContent = 'Asking Printer Bot...';
    result.setAttribute('data-id', 'c' + rtCheckId);
    Send('routeCheck', { trigger, values: JSON.stringify(values), id: 'c' + rtCheckId });
}

// Names of printers for a sentence: up to ten, joined with commas and "and", and "and N more" after that
function RtNameList(names, shown) {
    if (names.length <= 1) return names.join('');
    if (names.length <= shown) return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    return names.slice(0, shown).join(', ') + ' and ' + (names.length - shown) + ' more';
}

// 3.2.0-beta.3: what the printers a rule chose print the event on, when a rule names a paper or a tray: ' Printer 2 prints it on a 4 x 6 in card from MPTray (rule 3).'
// 3.2.0-beta.7: a printer with more than one receipt (every rule prints, Do not stop at first match) has a sentence for each, its own paper and tray too
function RtChoicesText(data) {
    const all = Array.isArray(data.choices) ? data.choices.filter(isObj) : [];
    const count = new Map();
    for (const c of all) { const p = Math.round(num(c.printer)); count.set(p, (count.get(p) || 0) + 1); }
    const choices = all.filter(c => c.paperSize || c.paperTray || count.get(Math.round(num(c.printer))) > 1);
    return choices.slice(0, RT_NAMES_SHOWN).map(c => ` ${RtPrinterLabel(Math.round(num(c.printer)))} prints it ${RtChoicePhrase(c) || 'on its own paper and tray'} (rule ${Math.round(num(c.rule))}).`).join('');
}

// 3.2.0-beta.7 (the owner, 18 October 2026): with Do not stop at first match on, every rule an event passes prints, on its printer with its paper and tray (the core's choices
// hold one entry for each receipt a rule sends, RtChoicesText), and a rule whose receipt would be the same as an earlier receipt of its printer adds no print. The core names those
// rules (same: { rule, as: the earlier rule, printer }), and the answer says which, by printer and earlier rule in the order the core gives them. An action that does not name
// them gets no such sentence. Until 3.2.0-beta.7 a printer printed an event once, and the page worked out which rules added no print from the rules of the status.
function RtSameText(data) {
    const groups = new Map();                                               // '<printer>:<earlier rule>' -> { printer, as, rules }
    for (const x of Array.isArray(data.same) ? data.same.filter(isObj) : []) {
        const rule = Math.round(num(x.rule)), as = Math.round(num(x.as)), printer = Math.round(num(x.printer));
        if (!(rule >= 1 && as >= 1 && printer >= 1)) continue;
        const key = `${printer}:${as}`;
        if (!groups.has(key)) groups.set(key, { printer, as, rules: [] });
        groups.get(key).rules.push(rule);
    }
    if (groups.size === 0) return '';
    const parts = [...groups.values()].map(g => `${g.rules.length === 1 ? 'rule ' + g.rules[0] + ' adds' : 'rules ' + RtNameList(g.rules.map(String), RT_NAMES_SHOWN) + ' add'} no print, because rule ${g.as} already prints the same receipt on printer ${g.printer}`);
    const more = parts.length > RT_NAMES_SHOWN ? `; and the same on ${parts.length - RT_NAMES_SHOWN} more printers` : '';
    const text = parts.slice(0, RT_NAMES_SHOWN).join('; ') + more;
    return ` ${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// The answer to a route check
function PrintersOnRoute(data) {
    const result = rt$('check-result');
    if (!result || result.getAttribute('data-id') !== str(data.id, 40)) return;
    const all = Array.isArray(data.printers) ? data.printers.map(n => Math.round(num(n))).filter(n => n >= 1) : [];
    // 3.0.0-beta.7: the printers that take a Hype Train because of Do not cut Hype Trains come after the ones the rules chose
    const hype = Array.isArray(data.hypeTrain) ? data.hypeTrain.map(n => Math.round(num(n))).filter(n => n >= 1 && all.includes(n)) : [];
    const slots = all.filter(n => !hype.includes(n));
    const names = slots.map(RtPrinterLabel);
    const also = hype.length ? ` ${RtNameList(hype.map(RtPrinterLabel), RT_NAMES_SHOWN)} ${hype.length === 1 ? 'also takes it, because it has' : 'also take it, because they have'} Do not cut Hype Trains.` : '';
    const rules = Array.isArray(data.rules) ? data.rules.map(n => Math.round(num(n))) : [];
    const what = RtTriggerPhrase(str(data.trigger, 48));
    if (data.single === true) result.textContent = 'There is one printer, so every event prints on it.';
    else if (data.fallback === true) {
        const held = pbStatus && isObj(pbStatus.settings) && isObj(pbStatus.settings.routing) ? Math.round(num(pbStatus.settings.routing.routeAllElse)) : 0;
        result.textContent = held >= 1 && !slots.includes(held)
            ? `This ${what} passes no rule. Printer ${held} is the printer for everything else and is not set up, so this event prints on ${RtNameList(names, RT_NAMES_SHOWN)}.${also}`
            : `This ${what} passes no rule, so it prints on ${RtNameList(names, RT_NAMES_SHOWN)}, the printer for everything else.${also}`;
    }
    else result.textContent = `This ${what} prints on ${RtNameList(names, RT_NAMES_SHOWN)}.${RtChoicesText(data)} It passes ${rules.length === 1 ? 'rule ' + rules[0] : 'rules ' + (rules.length <= RT_NAMES_SHOWN ? rules.join(', ') : rules.slice(0, RT_NAMES_SHOWN).join(', ') + ' and ' + (rules.length - RT_NAMES_SHOWN) + ' more')}.${RtSameText(data)}${also}`;
}

rt$('add-printer-button').addEventListener('click', RtAddPrinter);
rt$('add-printer-button-multi').addEventListener('click', RtAddPrinter);
rt$('check-button').addEventListener('click', RtCheck);
rt$('cards-expand').addEventListener('click', () => RtSetAllOpen(true));
rt$('cards-collapse').addEventListener('click', () => RtSetAllOpen(false));
rt$('cards-find').addEventListener('input', RtApplyFilter);
RtFocus(rt$('add-rule'), 'ar');                                             // 3.2.0-beta.5: the rules section
rt$('add-rule').addEventListener('click', () => RtAddRule());
rt$('allMatches').addEventListener('change', () => RtEdit(w => { w.routing.stopAtFirstMatch = !rt$('allMatches').checked; }, false));
// 3.2.0-beta.4: a drag of a rule by its handle follows the pointer anywhere on the page (RtHookMove)
document.addEventListener('pointermove', (ev) => { if (rtDrag && ev.pointerId === rtDrag.pointer) { rtDrag.y = ev.clientY; RtDragMove(); } });
document.addEventListener('pointerup', (ev) => { if (rtDrag && ev.pointerId === rtDrag.pointer) RtDragEnd(true); });
document.addEventListener('pointercancel', (ev) => { if (rtDrag && ev.pointerId === rtDrag.pointer) RtDragEnd(false); });
{
    const elseList = rt$('route-else');
    RtFocus(elseList, 'else');
    elseList.addEventListener('change', () => RtEdit(w => { w.routing.routeAllElse = parseInt(elseList.value, 10); }, true));
}
for (const id of ['printProfile', 'dither', 'allowHighRoller', 'uncutHypeTrain']) rt$(id).addEventListener('change', () => { if (working) RtRefreshWords(); });
for (const id of ['paperWidthMm', 'paperTray']) rt$(id).addEventListener('change', PrintersUpdateMore);         // 3.2.0-beta.4: what printer 1's rules show of it
rt$('highRollerBits').addEventListener('input', RtRenderHighRoller);
rt$('highRollerBits').addEventListener('change', RtRenderHighRoller);
rt$('youtubeHighRollerAmount').addEventListener('input', RtRenderYouTube);
