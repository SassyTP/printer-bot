// ============================================================================
// Printer Bot dock: more than one printer, and the rules that choose the printers of an event (3.0)
//
// With one printer nothing here is visible: the rows of printer 1 sit where they always did and one row offers "Add another printer".
// With more printers the Settings card shows a card for each printer. The card holds the printer's own settings and the rules that send events to it,
// and one list below the cards names the printer for everything that no rule names.
//
// What the page shows is a working copy of printers 2 to 5 and of the routing (`working`). It can hold a rule that is not finished (a trigger still to be
// picked, a parameter without a name, a value that is missing). Such a rule is shown with a warning and is not sent. If the rule was saved before the edit,
// its last complete version (`good`) stays in force until the edit is complete, so a rule that is being changed does not stop working. A new rule is
// saved when it is complete, which is when a trigger is picked. Every edit is sent after a moment, like the other settings, and the action answers
// with a status. When the action's settings differ from what was sent and nothing is waiting, the page takes the action's settings.
//
// This file is loaded before app.js, so nothing at the top level may call app.js. The functions below use its helpers (h, str, num, isObj, hasOwn, Send,
// pbStatus, pendingSettings) when they run. They only run after both files have loaded.
// ============================================================================

const rt$ = (id) => document.getElementById(id);

const RT_MODES = ['escpos', 'windows', 'png'];
const RT_MODE_NAMES = { escpos: 'Thermal printer (ESC/POS)', windows: 'Windows printer driver', png: 'Preview only (no printer)' };
const RT_DITHERS = ['floyd', 'atkinson', 'threshold'];
const RT_DITHER_NAMES = { floyd: 'Detailed', atkinson: 'Soft', threshold: 'Crisp (no shading)' };
const RT_CUTS = ['partial', 'full', 'none'];
const RT_CUT_NAMES = { partial: 'Partial', full: 'Full', none: 'None' };
const RT_DEFAULT_LIMITS = { printers: 5, rules: 30, conditions: 4, valueChars: 48 };
const RT_TRIGGER_NAME = /^(\*|[A-Za-z0-9_]{1,48}\*?)$/;
const RT_FIELD_NAME = /^[A-Za-z0-9_.[\]-]{1,64}$/;

const RT_TRIGGERS = new Map(ROUTE_CATALOG.triggers.map(t => [t.id, t]));
const RT_FAMILIES = new Map(ROUTE_CATALOG.families.map(f => [f.id, f]));
const RT_OP_KIND = (() => {
    const kinds = {};
    for (const kind of Object.keys(ROUTE_CATALOG.operators)) for (const pair of ROUTE_CATALOG.operators[kind]) kinds[pair[0]] = kind;
    return kinds;
})();
const RT_OP_NAME = (() => {
    const names = {};
    for (const kind of Object.keys(ROUTE_CATALOG.operators)) for (const pair of ROUTE_CATALOG.operators[kind]) names[pair[0]] = pair[1];
    return names;
})();
const RtNeedsValue = (op) => !ROUTE_CATALOG.noValue.includes(op);
const RT_OTHER = '@other';       // the value of the entry "Other parameter..." in a list of parameters. No parameter name starts with @

let working = null;             // { extras: [printers 2 to 5], routing: { routeAllElse, rules: [...] } } as the person sees it
let workingSaved = '';          // what was last sent or adopted, as text (see RtCanon)
let rtDrawn = '';               // a text that says what the cards were last built from
let rtMoved = false;            // are the rows of printer 1 inside its card?
let rtFocusKey = '';            // the control to give the focus back to after the cards are built again
let rtArmed = 0;                // the printer whose Remove button was pressed once
let rtArmTimer = null;
let rtCheckId = 0;
const rtCheckValues = {};       // what the person typed in the route check, by parameter name


// ---- the settings of the action, cleaned ---------------------------------------------------------------------------------------

function RtLimits() {
    const r = pbStatus && isObj(pbStatus.routing) ? pbStatus.routing : {};
    return {
        printers: num(r.maxPrinters) || RT_DEFAULT_LIMITS.printers, rules: num(r.maxRules) || RT_DEFAULT_LIMITS.rules,
        conditions: num(r.maxConditions) || RT_DEFAULT_LIMITS.conditions, valueChars: num(r.maxValueChars) || RT_DEFAULT_LIMITS.valueChars,
    };
}

const RtClamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(num(v))));

function RtCleanExtra(p) {
    p = isObj(p) ? p : {};
    return {
        printer: str(p.printer, 256).trim(),
        paperWidthMm: RtClamp(p.paperWidthMm == null ? 80 : p.paperWidthMm, 40, 110),
        mode: RT_MODES.includes(p.mode) ? p.mode : 'escpos',
        dither: RT_DITHERS.includes(p.dither) ? p.dither : 'floyd',
        cut: RT_CUTS.includes(p.cut) ? p.cut : 'partial',
        feedDots: RtClamp(p.feedDots == null ? 80 : p.feedDots, 0, 400),
    };
}

function RtCleanCondition(c) {
    c = isObj(c) ? c : {};
    return { field: str(c.field, 64).trim(), op: str(c.op, 20).trim(), value: str(c.value, 48) };
}

function RtCleanRule(r) {
    r = isObj(r) ? r : {};
    return { to: Math.round(num(r.to)) || 1, trigger: str(r.trigger, 48).trim(), when: (Array.isArray(r.when) ? r.when : []).slice(0, 4).map(RtCleanCondition) };
}

function RtReadConfig(settings) {
    const st = isObj(settings) ? settings : {};
    const routing = isObj(st.routing) ? st.routing : {};
    const cfg = {
        extras: (Array.isArray(st.extraPrinters) ? st.extraPrinters : []).slice(0, 4).map(RtCleanExtra),
        routing: { routeAllElse: Math.round(num(routing.routeAllElse)) || 1, rules: (Array.isArray(routing.rules) ? routing.rules : []).slice(0, 30).map(RtCleanRule) },
    };
    RtMarkGood(cfg);
    return cfg;
}

// A rule that can be sent: its printer is there, it has no more conditions than the action keeps, and it is complete
function RtRuleSavable(r, count, limits) {
    if (!(r.to >= 1 && r.to <= count) || r.when.length > limits.conditions || RtRuleProblem(r) !== '') return false;
    return r.when.every(c => c.value.trim().length <= limits.valueChars);
}

// The part of a rule that its last complete version keeps: the trigger and the conditions (the printer is the one of the rule)
const RtPart = (r) => ({ trigger: r.trigger, when: r.when.map(c => ({ field: c.field, op: c.op, value: c.value })) });

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
        const part = RtRuleSavable(r, count, limits) ? RtPart(r) : (r.good && r.to >= 1 && r.to <= count ? r.good : null);
        if (part && rules.length < limits.rules) rules.push({ to: r.to, trigger: part.trigger, when: part.when.map(c => ({ field: c.field, op: c.op, value: RtNeedsValue(c.op) ? c.value.trim() : '' })) });
    }
    const rest = cfg.routing.routeAllElse;
    return { extraPrinters: cfg.extras.map(RtCleanExtra), routing: { routeAllElse: rest >= 1 && rest <= count ? rest : 1, rules } };
}

const RtCanon = (cfg) => JSON.stringify(RtForSaving(cfg));
const RtClone = (cfg) => JSON.parse(JSON.stringify(cfg));

function RtWaiting() {
    return !!pendingSettings && (hasOwn(pendingSettings, 'extraPrinters') || hasOwn(pendingSettings, 'routing') || hasOwn(inFlight, 'extraPrinters') || hasOwn(inFlight, 'routing'));
}


// ---- looking things up -----------------------------------------------------------------------------------------------------------

function RtTriggerText(id) {
    if (RT_FAMILIES.has(id)) return RT_FAMILIES.get(id).label;
    const t = RT_TRIGGERS.get(id);
    return t ? `${t.platform}: ${t.label}` : id;
}

const RtFieldsOf = (triggerId) => RT_TRIGGERS.has(triggerId) ? RT_TRIGGERS.get(triggerId).fields : [];
const RtFieldInfo = (triggerId, name) => RtFieldsOf(triggerId).find(f => f.name === name) || null;
const RtKindOf = (rule, cond) => { const info = RtFieldInfo(rule.trigger, cond.field); return info ? info.type : (RT_OP_KIND[cond.op] || 'text'); };

function RtFirstOp(kind) { return ROUTE_CATALOG.operators[kind][0][0]; }
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
    if (RT_FAMILIES.has(rule.trigger)) return `Prints ${RtTriggerPhrase(rule.trigger)}.`;
    const where = rule.when.map(c => RtConditionText(rule, c)).join(' and ');
    return `Prints every ${RtTriggerPhrase(rule.trigger)}${where ? ' where ' + where : ''}.`;
}

// What is missing from a rule, or '' when the rule is complete
function RtRuleProblem(rule) {
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
    return list.find(p => p.slot === slot) || null;
}

function RtPrinterName(slot) {
    if (slot > 1 && working && working.extras[slot - 2]) return working.extras[slot - 2].printer;          // what the person chose, before the action has answered
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
    return RtPrinterName(slot) || (slot === 1 ? 'Auto-detect' : 'Not set up yet');
}

const RtPrinterLabel = (slot) => `Printer ${slot}` + (RtPrinterName(slot) ? ` (${RtPrinterName(slot)})` : '');

// Is the printer set up? Printer 1 always is (it can auto-detect). The others need a printer chosen, or the preview mode, which has nothing to send to.
function RtSetUp(slot) {
    if (slot === 1) return true;
    const extra = working && working.extras[slot - 2];
    return !!extra && (!!extra.printer || extra.mode === 'png');
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

function RtRow(label, description, control) {
    return h('div', { class: 'setting' }, h('div', null, h('div', { class: 'setting-label' }, label), description ? h('div', { class: 'setting-description' }, description) : null), control);
}

function RtFocus(el, key) { el.setAttribute('data-k', key); return el; }


// ---- editing ----------------------------------------------------------------------------------------------------------------------

// Records an edit. rebuild: build the cards again (a change of structure or of a list), else only the words that depend on what was typed.
function RtEdit(change, rebuild) {
    change(working);
    RtMarkGood(working);
    rtFocusKey = document.activeElement && document.activeElement.getAttribute ? (document.activeElement.getAttribute('data-k') || '') : '';
    const patch = RtForSaving(working);
    pendingSettings.extraPrinters = patch.extraPrinters;
    pendingSettings.routing = patch.routing;
    awaitingSave = true;                                    // the Saved flag shows when the status that answers the save arrives
    clearTimeout(saveTimer);
    saveTimer = setTimeout(SaveSettings, 400);
    if (rebuild) RtBuild(); else RtRefreshWords();
}

function RtAddPrinter() {
    if (!working || working.extras.length >= RtLimits().printers - 1) return;
    const base = pbStatus && isObj(pbStatus.settings) ? pbStatus.settings : {};
    RtEdit(w => w.extras.push(RtCleanExtra({
        printer: '', paperWidthMm: base.paperWidthMm, mode: base.mode, dither: base.dither, cut: base.cut, feedDots: base.feedDots,
    })), true);
}

function RtRemovePrinter(slot) {
    RtEdit(w => {
        w.extras.splice(slot - 2, 1);
        w.routing.rules = w.routing.rules.filter(r => r.to !== slot).map(r => Object.assign({}, r, { to: r.to > slot ? r.to - 1 : r.to }));
        const rest = w.routing.routeAllElse;
        w.routing.routeAllElse = rest === slot ? 1 : rest > slot ? rest - 1 : rest;
        if (w.extras.length === 0) w.routing = { routeAllElse: 1, rules: [] };        // one printer again: no rule stays behind where nobody can see it
    }, true);
}

function RtAddRule(slot) {
    const limits = RtLimits();
    if (working.routing.rules.length >= limits.rules) return;
    RtEdit(w => w.routing.rules.push({ to: slot, trigger: '', when: [] }), true);
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


// ---- building the cards -------------------------------------------------------------------------------------------------------

function RtChoiceValue(info, cond) {
    return info && info.factor && cond.value !== '' && isFinite(Number(cond.value)) ? String(Number(cond.value) / info.factor) : cond.value;
}

function RtBuildCondition(rule, ri, ci) {
    const cond = rule.when[ci];
    const info = RtFieldInfo(rule.trigger, cond.field);
    const custom = !!cond.custom || !info;
    const kind = info ? info.type : (RT_OP_KIND[cond.op] || 'text');
    const key = `c${ri}-${ci}`;
    const el = h('div', { class: 'cond' });

    // the parameter
    const groups = [];
    for (const f of RtFieldsOf(rule.trigger)) {
        let g = groups.find(x => x.label === f.group);
        if (!g) { g = { label: f.group, items: [] }; groups.push(g); }
        g.items.push([f.name, `${f.label} (${f.name})`]);
    }
    groups.push({ label: 'Not in the list', items: [[RT_OTHER, 'Other parameter...']] });
    const field = RtFocus(RtSelect(groups, custom ? RT_OTHER : cond.field, { class: 'cond-field', 'aria-label': 'Parameter' }), key + 'f');
    field.addEventListener('change', () => RtEdit(() => RtChangeField(rule, cond, field.value), true));
    el.append(field);

    if (custom) {
        const name = RtFocus(h('input', { type: 'text', class: 'cond-name', maxlength: '64', placeholder: 'Variable name', 'aria-label': 'Variable name', spellcheck: 'false' }), key + 'n');
        name.value = cond.field;
        name.addEventListener('input', () => RtEdit(() => { cond.field = name.value.trim(); }, false));
        name.addEventListener('change', () => RtEdit(() => { cond.field = name.value.trim(); }, false));
        const type = RtFocus(RtSelect([['number', 'a number'], ['text', 'text'], ['flag', 'yes or no']], kind, { class: 'cond-kind', 'aria-label': 'Kind of value' }), key + 'k');
        type.addEventListener('change', () => RtEdit(() => RtChangeKind(cond, type.value), true));
        el.append(name, type);
    }

    // the test
    const ops = ROUTE_CATALOG.operators[kind];
    const op = RtFocus(RtSelect(ops.map(p => [p[0], p[1]]), ops.some(p => p[0] === cond.op) ? cond.op : ops[0][0], { class: 'cond-op', 'aria-label': 'Test' }), key + 'o');
    op.addEventListener('change', () => RtEdit(() => { cond.op = op.value; if (!RtNeedsValue(cond.op)) cond.value = ''; }, true));
    el.append(op);

    // the value
    if (RtNeedsValue(cond.op)) {
        const limits = RtLimits();
        let value;
        if (info && info.choices) {
            const list = info.choices.map(c => [c[0], c[1]]);
            if (cond.value !== '' && !info.choices.some(c => c[0] === cond.value)) list.push([cond.value, cond.value]);
            value = RtFocus(RtSelect([['', 'Choose...']].concat(list), cond.value, { class: 'cond-value', 'aria-label': 'Value' }), key + 'v');
            value.addEventListener('change', () => RtEdit(() => { cond.value = value.value; }, true));
        } else if (kind === 'number') {
            value = RtFocus(h('input', { type: 'number', class: 'cond-value', step: 'any', 'aria-label': 'Value', placeholder: 'Number' }), key + 'v');
            value.value = RtChoiceValue(info, cond);
            const factor = info && info.factor ? info.factor : 1;
            const store = () => { const v = value.value.trim(); cond.value = v === '' || !isFinite(Number(v)) ? '' : String(Math.round(Number(v) * factor * 1e6) / 1e6); };      // (the rounding only removes the dust of a sum such as 0.1 * 1000000)
            value.addEventListener('input', () => RtEdit(store, false));
            value.addEventListener('change', () => RtEdit(store, false));
        } else {
            value = RtFocus(h('input', { type: 'text', class: 'cond-value', maxlength: String(limits.valueChars), 'aria-label': 'Value', placeholder: 'Text' }), key + 'v');
            value.value = cond.value;
            value.addEventListener('input', () => RtEdit(() => { cond.value = value.value; }, false));
            value.addEventListener('change', () => RtEdit(() => { cond.value = value.value.trim(); }, false));
        }
        el.append(value);
    }

    const remove = RtFocus(h('button', { type: 'button', class: 'icon-small cond-remove', 'aria-label': 'Remove this condition', title: 'Remove this condition' }, '\u00D7'), key + 'x');
    remove.addEventListener('click', () => RtEdit(() => { rule.when.splice(ci, 1); }, true));
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
    trigger.addEventListener('change', () => RtEdit(() => RtChangeTrigger(rule, trigger.value), true));
    const remove = RtFocus(h('button', { type: 'button', class: 'icon-small', 'aria-label': 'Remove this rule', title: 'Remove this rule' }, '\u00D7'), `rx${ri}`);
    remove.addEventListener('click', () => RtEdit(w => w.routing.rules.splice(ri, 1), true));
    el.append(h('div', { class: 'rule-head' }, h('span', { class: 'rule-number' }, `Rule ${ri + 1}`), trigger, remove));

    for (let ci = 0; ci < rule.when.length; ci++) el.append(RtBuildCondition(rule, ri, ci));

    if (!family && rule.trigger !== '' && rule.when.length < limits.conditions) {
        const add = RtFocus(h('button', { type: 'button', class: 'small-button' }, rule.when.length === 0 ? 'Only when a parameter matches...' : 'Add a condition'), `ca${ri}`);
        add.addEventListener('click', () => RtEdit(() => { rule.when.push(RtNewCondition(rule)); }, true));
        el.append(h('div', { class: 'rule-actions' }, add));
    }
    el.append(h('p', { class: 'rule-summary' + (problem ? ' warn' : ''), 'data-rule': String(ri) }, RtRuleLine(rule)));
    return el;
}

function RtExtraPrinterRow(slot) {
    const extra = working.extras[slot - 2];
    const edit = (key, value, rebuild) => RtEdit(() => { extra[key] = value; }, rebuild);

    const installed = pbStatus ? pbStatus.printer.installed : [];
    const taken = new Set();
    for (let s = 1; s <= 1 + working.extras.length; s++) {
        if (s === slot) continue;
        const name = s === 1 ? RtPrinterName(1) : working.extras[s - 2].printer;
        if (name) taken.add(name.toLowerCase());
    }
    const names = installed.slice();
    if (extra.printer && !names.some(n => n.toLowerCase() === extra.printer.toLowerCase())) names.unshift(extra.printer);
    const items = [['', 'Choose a printer...']].concat(names.map(n => [n, n + (installed.includes(n) ? '' : ' (not installed)'), taken.has(n.toLowerCase()) && n.toLowerCase() !== extra.printer.toLowerCase()]));
    const printer = RtFocus(RtSelect(items, extra.printer, { 'aria-label': `Printer ${slot}` }), `p${slot}`);
    printer.addEventListener('change', () => edit('printer', printer.value, true));
    const info = RtPrinterInfo(slot);
    return RtRow('Printer', info && info.note ? info.note : '', printer);
}

function RtExtraMore(slot) {
    const extra = working.extras[slot - 2];
    const edit = (key, value, rebuild) => RtEdit(() => { extra[key] = value; }, rebuild);
    const rows = [];
    const width = RtFocus(RtSelect([['80', '80 mm'], ['58', '58 mm']], extra.paperWidthMm >= 70 ? '80' : '58', { 'aria-label': 'Paper width' }), `w${slot}`);
    width.addEventListener('change', () => edit('paperWidthMm', parseInt(width.value, 10), true));
    rows.push(RtRow('Paper width', '', width));
    const mode = RtFocus(RtSelect(RT_MODES.map(m => [m, RT_MODE_NAMES[m]]), extra.mode, { 'aria-label': 'Output' }), `m${slot}`);
    mode.addEventListener('change', () => edit('mode', mode.value, true));
    rows.push(RtRow('Output', typeof modeText === 'function' ? modeText(extra.mode) : '', mode));
    const dither = RtFocus(RtSelect(RT_DITHERS.map(d => [d, RT_DITHER_NAMES[d]]), extra.dither, { 'aria-label': 'Picture style' }), `d${slot}`);
    dither.addEventListener('change', () => edit('dither', dither.value, true));
    rows.push(RtRow('Picture style', 'How avatars are turned into black and white', dither));
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

function RtMoreHint(slot) {
    const cfg = slot === 1 ? {
        paperWidthMm: num(rt$('paperWidthMm').value), mode: rt$('mode').value, dither: rt$('dither').value,
    } : working.extras[slot - 2];
    return `${cfg.paperWidthMm >= 70 ? 80 : 58} mm \u00B7 ${RT_MODE_NAMES[cfg.mode] || cfg.mode} \u00B7 ${RT_DITHER_NAMES[cfg.dither] || cfg.dither}`;
}

function RtBuildCard(slot) {
    const card = h('section', { class: 'printer-card', 'data-slot': String(slot) });
    const head = h('div', { class: 'printer-card-head' }, h('h3', { class: 'printer-card-title' }, `Printer ${slot}`));
    head.append(h('span', { class: 'printer-card-name muted' }, RtCardName(slot)));
    // The tag and Remove are one group. When the line is too short for the title, the name and the group, the group goes to the next line as a whole.
    const tools = h('div', { class: 'printer-card-tools' });
    if (working.routing.routeAllElse === slot) tools.append(h('span', { class: 'printer-card-else' }, 'Everything else'));
    if (slot > 1) {
        const armed = rtArmed === slot;
        const remove = RtFocus(h('button', { type: 'button', class: 'small-button' + (armed ? ' confirming' : ''), 'aria-label': `Remove printer ${slot}` }, armed ? 'Sure? Remove' : 'Remove'), `rp${slot}`);
        remove.addEventListener('click', () => {
            if (rtArmed === slot) { rtArmed = 0; clearTimeout(rtArmTimer); RtRemovePrinter(slot); return; }
            rtArmed = slot;
            clearTimeout(rtArmTimer);
            rtArmTimer = setTimeout(() => { rtArmed = 0; RtBuild(); }, 5000);
            RtBuild();
        });
        tools.append(remove);
    }
    if (tools.children.length > 0) head.append(tools);
    card.append(head);

    const body = h('div', { class: 'printer-body' });
    const more = h('details', { class: 'advanced printer-more', 'data-more': String(slot) });
    const hint = h('span', { class: 'printer-more-hint muted' }, RtMoreHint(slot));
    more.append(h('summary', null, 'Paper and output', hint));
    const moreBody = h('div', { class: 'printer-more-body' });
    if (slot === 1) {
        body.append(rt$('printer-one-main'));
        moreBody.append(rt$('printer-one-more'));
    } else {
        if (working.extras[slot - 2].mode !== 'png') body.append(RtExtraPrinterRow(slot));         // the preview mode has no printer to choose
        for (const row of RtExtraMore(slot)) moreBody.append(row);
    }
    more.append(moreBody);
    if (slot === 1) more.open = false;
    body.append(more);
    card.append(body);

    // the rules of this printer
    const routing = h('div', { class: 'routing' }, h('div', { class: 'routing-title' }, 'Prints these events'));
    const rules = h('div', { class: 'rules' });
    let own = 0;
    working.routing.rules.forEach((r, ri) => { if (r.to === slot) { rules.append(RtBuildRule(ri)); own++; } });
    routing.append(rules);
    const limits = RtLimits();
    const ready = RtSetUp(slot);
    const rest = working.routing.routeAllElse === slot;
    const add = RtFocus(h('button', { type: 'button', class: 'small-button' }, 'Add a rule'), `ar${slot}`);
    add.disabled = working.routing.rules.length >= limits.rules || !ready;
    add.addEventListener('click', () => RtAddRule(slot));
    routing.append(h('div', { class: 'rule-actions' }, add));

    // Picks this printer for everything else, with a switch like the other switches of the dock. Exactly one printer has its switch on. Turning one on is an edit of the one
    // number that the list under the cards shows too (routeAllElse), so the switch that was on goes off with it. The switch that is on cannot be turned off, because there is
    // always a printer for everything else (turn another one on to move it). It stays focusable, so the keyboard is still on it after the cards are drawn again. A printer that
    // is not set up cannot be turned on, as in that list.
    const pick = RtFocus(h('input', { type: 'checkbox', id: `route-pick-${slot}`, 'aria-label': `Use printer ${slot} for everything else` }), `pick${slot}`);
    pick.checked = rest;
    pick.disabled = !ready;
    if (rest) pick.setAttribute('aria-disabled', 'true');
    pick.addEventListener('change', () => {
        if (rest) { pick.checked = true; return; }
        if (pick.checked) RtEdit(w => { w.routing.routeAllElse = slot; }, true);
    });
    const pickText = h('div', null, h('label', { class: 'setting-label', for: `route-pick-${slot}` }, 'Use this printer for everything else'));
    if (rest) pickText.append(h('div', { class: 'setting-description' }, 'Turn it on for another printer to move it.'));
    routing.append(h('div', { class: 'setting route-pick' + (rest ? ' on' : '') + (ready ? '' : ' off') }, pickText, h('label', { class: 'switch' }, pick, h('span', { class: 'slider' }))));

    let note = '', warn = false;
    if (!ready && rest) { note = 'Choose a printer first. Until then, everything else prints on printer 1.'; warn = true; }
    else if (!ready) { note = 'Choose a printer first. A printer that is not set up takes no receipts.'; warn = true; }
    else if (own === 0 && rest) note = 'No rules. This printer prints everything the other printers do not take.';
    else if (own === 0) { note = 'No rules, so nothing prints here. Add a rule, or use this printer for everything else.'; warn = true; }
    else if (rest) note = 'This printer also prints every event that no rule names.';
    if (note) routing.append(h('p', { class: 'routing-empty' + (warn ? ' warn' : '') }, note));
    card.append(routing);
    return card;
}


// ---- the section ---------------------------------------------------------------------------------------------------------------------

// What the cards are built from, so a status that changes nothing does not build them again
function RtSignature() {
    const printers = pbStatus ? JSON.stringify([pbStatus.printer.installed, pbStatus.printers.map(p => [p.slot, p.name, p.note])]) : '';
    return JSON.stringify([RtClone(working), rtArmed, printers]);
}

function RtBuild() {
    if (!working || !pbStatus) return;
    const multi = working.extras.length > 0;
    const single = rt$('printers-single'), many = rt$('printers-multi');
    many.hidden = !multi;
    rt$('add-printer-row').hidden = multi;
    const limits = RtLimits();
    const canAdd = working.extras.length < limits.printers - 1;

    // the rows of printer 1 go into its card, or back to their place
    const one = rt$('printer-one-main'), oneMore = rt$('printer-one-more');
    if (!multi) {
        if (rtMoved) { single.prepend(oneMore); single.prepend(one); rtMoved = false; }
        rt$('printer-cards').replaceChildren();
        rtDrawn = RtSignature();
        RtRenderTestTargets();
        return;
    }
    // take the rows out of the old card before it is thrown away
    if (rtMoved) { single.prepend(oneMore); single.prepend(one); rtMoved = false; }
    const open = {};
    document.querySelectorAll('#printer-cards details[data-more]').forEach(d => { open[d.getAttribute('data-more')] = d.open; });
    const cards = [];
    for (let slot = 1; slot <= 1 + working.extras.length; slot++) cards.push(RtBuildCard(slot));
    rtMoved = true;
    rt$('printer-cards').replaceChildren(...cards);
    document.querySelectorAll('#printer-cards details[data-more]').forEach(d => { if (hasOwn(open, d.getAttribute('data-more'))) d.open = open[d.getAttribute('data-more')]; });

    rt$('add-printer-row-multi').hidden = !canAdd;
    rt$('add-printer-note').textContent = `Up to ${limits.printers} printers.`;
    RtBuildElse();
    RtBuildCheck();
    RtRenderTestTargets();
    rtDrawn = RtSignature();
    if (rtFocusKey) {
        const again = document.querySelector(`#printers-multi [data-k="${rtFocusKey}"]`);
        if (again) again.focus();
    }
}

function RtBuildElse() {
    const count = 1 + working.extras.length;
    const items = [];
    for (let slot = 1; slot <= count; slot++) items.push([String(slot), RtPrinterLabel(slot), !RtSetUp(slot)]);
    const select = RtSelect(items, String(working.routing.routeAllElse), { id: 'route-else', 'aria-describedby': 'route-else-description' });
    select.addEventListener('change', () => RtEdit(w => { w.routing.routeAllElse = parseInt(select.value, 10); }, true));
    RtFocus(select, 'else');
    rt$('route-else').replaceWith(select);
    const rest = working.routing.routeAllElse;
    const warning = rt$('route-else-warning');
    warning.hidden = RtSetUp(rest);
    warning.textContent = RtSetUp(rest) ? '' : `Printer ${rest} is not set up, so everything else prints on printer 1 until you choose a printer for it.`;
}

// The words under the rules change as the person types, without building the cards again
function RtRefreshWords() {
    document.querySelectorAll('#printer-cards .rule-summary').forEach(p => {
        const rule = working.routing.rules[parseInt(p.getAttribute('data-rule'), 10)];
        if (!rule) return;
        const problem = RtRuleProblem(rule);
        p.textContent = RtRuleLine(rule);
        p.classList.toggle('warn', !!problem);
        p.closest('.rule').classList.toggle('unfinished', !!problem);
    });
    document.querySelectorAll('#printer-cards .printer-more-hint').forEach(s => { s.textContent = RtMoreHint(parseInt(s.closest('details').getAttribute('data-more'), 10)); });
    document.querySelectorAll('#printer-cards .printer-card-name').forEach(s => { s.textContent = RtCardName(parseInt(s.closest('.printer-card').getAttribute('data-slot'), 10)); });
}

// Called with every status. Takes the action's printers and rules when nothing of the person's is waiting.
function PrintersRender(s) {
    const supported = hasOwn(s.settings, 'extraPrinters') && hasOwn(s.settings, 'routing');
    for (const id of ['add-printer-button', 'add-printer-button-multi']) {
        rt$(id).disabled = !supported;
        if (supported) rt$(id).removeAttribute('title'); else rt$(id).title = 'The Printer Bot action is older than this dock. Update it to use more than one printer.';
    }
    if (!supported) { working = RtReadConfig({}); RtBuild(); return; }
    const incoming = RtReadConfig(s.settings);
    const typing = !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('#printers-multi') && /^(INPUT|SELECT|BUTTON)$/.test(document.activeElement.tagName);
    if (working === null || (!RtWaiting() && !typing && RtCanon(working) !== RtCanon(incoming))) working = incoming;
    if (RtSignature() !== rtDrawn && !(typing && working !== null && rtDrawn !== '')) RtBuild();
    else RtRefreshWords();
}

function PrintersUpdateMore() { if (working) RtRefreshWords(); }


// ---- the Test card and the status ---------------------------------------------------------------------------------------------

function RtRenderTestTargets() {
    const row = rt$('test-printers-row');
    const multi = !!working && working.extras.length > 0;
    row.hidden = !multi;
    if (!multi) return;
    const keep = rt$('test-printers').value;
    const items = [];
    for (let slot = 1; slot <= 1 + working.extras.length; slot++) items.push([String(slot), RtPrinterLabel(slot), !RtSetUp(slot)]);
    items.push(['all', 'All printers']);
    const select = RtSelect(items, keep && items.some(i => i[0] === keep && !i[2]) ? keep : '1', { id: 'test-printers' });
    rt$('test-printers').replaceWith(select);
}

// The value of "printers" for the testPrint command: nothing with one printer, else the text all or the number of one printer
function PrintersTestTarget() {
    if (!working || working.extras.length === 0 || rt$('test-printers-row').hidden) return undefined;
    const v = rt$('test-printers').value;
    return v === 'all' ? 'all' : String(parseInt(v, 10) || 1);
}

// Rows for the status card when there is more than one printer. Returns null with one.
function PrintersStatusRows(s) {
    const list = Array.isArray(s.printers) ? s.printers : [];
    if (list.length < 2) return null;
    const rows = [];
    for (const p of list) {
        const png = p.mode === 'png';
        const q = p.queue;
        const queueBad = !png && !!p.name && !!q && (q.state === 'error' || q.state === 'stale');
        const text = png ? 'preview only' : p.name ? p.name + (p.auto ? ' (auto-detected)' : '') : (p.note || (p.slot === 1 ? 'none found' : 'not set up'));
        const kids = [h('span', null, text)];
        if (queueBad) kids.push(h('span', { class: 'queue-' + q.state }, ' \u00B7 ' + (q.text || 'the print queue has a problem')));
        rows.push([`Printer ${p.slot}`, h('span', null, ...kids)]);
    }
    return rows;
}

// A sentence for the status line when one of the printers cannot print, or '' when all can
function PrintersProblem(s) {
    const list = Array.isArray(s.printers) ? s.printers : [];
    if (list.length < 2) return '';
    for (const p of list) {
        if (p.mode === 'png') continue;
        if (!p.name) return p.slot === 1 ? 'No printer found for printer 1. Install your receipt printer, or pick one below.' : `Printer ${p.slot} is ${p.note ? 'not installed' : 'not set up'}. Pick a printer for it below.`;
        const q = p.queue;
        if (q && (q.state === 'error' || q.state === 'stale')) return `Printer ${p.slot}: ${q.text || 'the print queue has a problem.'}`;
    }
    return '';
}


// ---- the route check ---------------------------------------------------------------------------------------------------------------

function RtBuildCheck() {
    const select = rt$('check-trigger');
    if (!select.options.length) {
        const groups = [];
        for (const platform of ['Twitch', 'YouTube', 'Kick', 'StreamElements', 'Streamlabs', 'Fourthwall']) {
            groups.push({ label: platform, items: ROUTE_CATALOG.triggers.filter(t => t.platform === platform).map(t => [t.id, `${t.platform}: ${t.label}`]) });
        }
        const fresh = RtSelect(groups, 'TwitchCheer', { id: 'check-trigger' });
        select.replaceWith(fresh);
        fresh.addEventListener('change', () => { RtBuildCheck(); });
    }
    const trigger = rt$('check-trigger').value;
    const seen = new Map();
    for (const rule of working.routing.rules) {
        if (!RtTriggerMatches(rule.trigger, trigger)) continue;
        for (const c of rule.when) if (RT_FIELD_NAME.test(c.field) && !seen.has(c.field)) seen.set(c.field, { rule, cond: c });
    }
    const box = rt$('check-fields');
    const kids = [];
    if (seen.size === 0) kids.push(h('p', { class: 'hint' }, 'No rule tests a parameter of this trigger, so the answer does not depend on any value.'));
    for (const [name, use] of seen) {
        const info = RtFieldInfo(trigger, name);
        const kind = RtKindOf(use.rule, use.cond);
        let control;
        if (info && info.choices) control = RtSelect([['', '(not given)']].concat(info.choices.map(c => [c[0], c[1]])), rtCheckValues[name] || '', { 'aria-label': name });
        else if (kind === 'flag') control = RtSelect([['', '(not given)'], ['true', 'yes'], ['false', 'no']], rtCheckValues[name] || '', { 'aria-label': name });
        else control = h('input', { type: kind === 'number' ? 'number' : 'text', step: 'any', 'aria-label': name, placeholder: kind === 'number' ? 'Number' : 'Text' });
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
    rtCheckId += 1;
    const result = rt$('check-result');
    result.hidden = false;
    result.textContent = 'Asking Printer Bot...';
    result.setAttribute('data-id', 'c' + rtCheckId);
    Send('routeCheck', { trigger, values: JSON.stringify(values), id: 'c' + rtCheckId });
}

// The answer to a route check
function PrintersOnRoute(data) {
    const result = rt$('check-result');
    if (!result || result.getAttribute('data-id') !== str(data.id, 40)) return;
    const slots = Array.isArray(data.printers) ? data.printers.map(n => Math.round(num(n))).filter(n => n >= 1) : [];
    const names = slots.map(RtPrinterLabel);
    const rules = Array.isArray(data.rules) ? data.rules.map(n => Math.round(num(n))) : [];
    const what = RtTriggerPhrase(str(data.trigger, 48));
    if (data.single === true) result.textContent = 'There is one printer, so every event prints on it.';
    else if (data.fallback === true) {
        const held = pbStatus && isObj(pbStatus.settings) && isObj(pbStatus.settings.routing) ? Math.round(num(pbStatus.settings.routing.routeAllElse)) : 0;
        result.textContent = held >= 1 && !slots.includes(held)
            ? `This ${what} passes no rule. Printer ${held} is the printer for everything else and is not set up, so this event prints on ${names.join(', ')}.`
            : `This ${what} passes no rule, so it prints on ${names.join(', ')}, the printer for everything else.`;
    }
    else result.textContent = `This ${what} prints on ${names.join(' and ')}. It passes ${rules.length === 1 ? 'rule ' + rules[0] : 'rules ' + rules.join(', ')}.`;
}

rt$('add-printer-button').addEventListener('click', RtAddPrinter);
rt$('add-printer-button-multi').addEventListener('click', RtAddPrinter);
rt$('check-button').addEventListener('click', RtCheck);
for (const id of ['paperWidthMm', 'mode', 'dither']) rt$(id).addEventListener('change', () => { if (working) RtRefreshWords(); });
