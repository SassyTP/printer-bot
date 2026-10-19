// ============================================================================
// Printer Bot dock: versions
//
// The syntax and the order of a version. The rule is written at the top of tools/build/Versions.cs, and the cases in tools/build/version-cases.json
// are run against this file, the router, the build tool, the loader and the hosting kit.
//   syntax   1 to 4 numbers separated by dots (a number is 0 or 1 to 6 digits without a leading zero), then optionally a dash and 1 to 4 identifiers
//            separated by dots (an identifier is 1 to 16 of 0-9 A-Z a-z, and one of digits only has no leading zero). At most 40 characters in all.
//   order    the numbers first (a missing one is 0). With equal numbers a release is above its prereleases. Prereleases compare identifier by identifier:
//            digits compare as numbers and are below text, text compares character by character, and the longer list wins when the shorter is its start.
//
// ParseVersion('3.0.0-beta.1') gives { numbers: [3, 0, 0, 0], pre: ['beta', '1'] }. A text that breaks the rule gives null.
// ============================================================================

const MAX_VERSION_LENGTH = 40;
const VERSION_NUMBERS_RX = /^(0|[1-9][0-9]{0,5})(\.(0|[1-9][0-9]{0,5})){0,3}$/;
const VERSION_IDENTIFIER_RX = /^[0-9A-Za-z]{1,16}$/;
const VERSION_DIGITS_RX = /^[0-9]+$/;

function ParseVersion(v) {
    if (typeof v !== 'string' || v.length === 0 || v.length > MAX_VERSION_LENGTH) return null;
    const dash = v.indexOf('-');
    const head = dash < 0 ? v : v.slice(0, dash);
    if (!VERSION_NUMBERS_RX.test(head)) return null;
    const pre = dash < 0 ? [] : v.slice(dash + 1).split('.');
    if (pre.length > 4) return null;
    for (const id of pre) {
        if (!VERSION_IDENTIFIER_RX.test(id)) return null;
        if (id.length > 1 && id[0] === '0' && VERSION_DIGITS_RX.test(id)) return null;
    }
    const numbers = head.split('.').map(Number);
    while (numbers.length < 4) numbers.push(0);
    return { numbers, pre };
}

function IsPrereleaseVersion(v) {
    const p = ParseVersion(v);
    return !!p && p.pre.length > 0;
}

function CompareVersionIdentifiers(x, y) {
    const nx = VERSION_DIGITS_RX.test(x), ny = VERSION_DIGITS_RX.test(y);
    if (nx && ny) return x.length !== y.length ? (x.length < y.length ? -1 : 1) : (x < y ? -1 : x > y ? 1 : 0);      // no leading zeros, so the longer one is larger
    if (nx) return -1;
    if (ny) return 1;
    return x < y ? -1 : x > y ? 1 : 0;                      // the identifiers are ASCII, so the order of the code units is the ordinal order
}

// -1, 0 or 1. Both arguments come from ParseVersion.
function CompareVersions(a, b) {
    for (let i = 0; i < 4; i++) if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] < b.numbers[i] ? -1 : 1;
    if (a.pre.length === 0 || b.pre.length === 0) return a.pre.length === b.pre.length ? 0 : (a.pre.length === 0 ? 1 : -1);
    const n = Math.min(a.pre.length, b.pre.length);
    for (let i = 0; i < n; i++) {
        const c = CompareVersionIdentifiers(a.pre[i], b.pre[i]);
        if (c !== 0) return c;
    }
    return a.pre.length === b.pre.length ? 0 : (a.pre.length < b.pre.length ? -1 : 1);
}

// The same for two version texts. Null when one of them is no version.
function CompareVersionTexts(x, y) {
    const a = ParseVersion(x), b = ParseVersion(y);
    return a && b ? CompareVersions(a, b) : null;
}
