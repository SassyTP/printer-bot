// ============================================================================
// Printer Bot dock: the triggers a rule can name and the parameters Streamer.bot sends with each of them
//
// A rule says "events of this trigger, whose parameters pass these tests, print on this printer". The menus of the rule editor are built from this list.
// It holds every trigger that Printer Bot has a receipt for (the handlers of the receipt page, plus the two Kick helpers that arrive as custom code events)
// and, for each, the variables Streamer.bot documents for that trigger (https://docs.streamer.bot) and the names the receipt page reads.
// A parameter that is missing here can still be named: the editor has an "Other parameter" entry for it.
//
// A field is { name, label, type, group } with these extras when they apply:
//   type     'number', 'text' or 'flag' (a yes/no value)
//   choices  [[value, label], ...]  the values the parameter can have. The editor shows a list to pick from
//   factor   the number the parameter is stored with is the number on screen times this (an amount in millionths is shown in whole units)
// Left out on purpose: lists and times that cannot be compared, copies of a value (escaped, URL encoded), picture addresses, the color parts, indexed names such as
// gift.recipientUser0 and the buyer's e-mail address (it would sit in settings.json and in every status message).
//
// This file holds ASCII only. The build checks it.
// ============================================================================

const ROUTE_CATALOG = (() => {
    const N = (name, label, extra) => Object.assign({ name, label, type: 'number' }, extra);
    const T = (name, label, extra) => Object.assign({ name, label, type: 'text' }, extra);
    const F = (name, label) => ({ name, label, type: 'flag' });
    const group = (title, fields) => fields.map(f => Object.assign({}, f, { group: title }));

    const SUB_TIERS = [['prime', 'Prime'], ['tier 1', 'Tier 1'], ['tier 2', 'Tier 2'], ['tier 3', 'Tier 3']];
    const PAID_TIERS = [['tier 1', 'Tier 1'], ['tier 2', 'Tier 2'], ['tier 3', 'Tier 3']];
    const TRAIN_TYPES = [['regular', 'Regular'], ['treasure', 'Treasure'], ['golden_kappa', 'Golden Kappa']];

    // ---- Twitch: the groups of variables that many triggers share -----------------------------------------------------------
    const twitchViewer = group('Viewer', [
        T('user', 'Display name'), T('userName', 'Login name'), T('userId', 'User ID'), T('userGroups', 'Streamer.bot groups (comma list)'),
        F('isSubscribed', 'Is a subscriber'), N('subscriptionTier', 'Subscription tier', { choices: [['1000', 'Tier 1'], ['2000', 'Tier 2'], ['3000', 'Tier 3']] }),
        N('monthsSubscribed', 'Months subscribed'), F('isModerator', 'Is a moderator'), F('isVip', 'Is a VIP'), N('badgeCount', 'Number of badges'),
    ]);
    // Streamer.bot sends the role with the chat variables, so only the triggers that arrive as a chat message have it
    const twitchRole = group('Viewer', [N('role', 'Role', { choices: [['1', 'Viewer'], ['2', 'VIP'], ['3', 'Moderator'], ['4', 'Broadcaster']] })]);
    const twitchMessage = group('Message', [
        T('message', 'Message'), T('messageStripped', 'Message without emotes'), N('emoteCount', 'Number of emotes'), F('firstMessage', 'First message in the channel'),
        F('isHighlight', 'Is a highlighted message'), F('isAction', 'Is a /me message'), F('isReply', 'Is a reply'), F('inSharedChat', 'Broadcast is in a shared chat'),
        F('fromSharedChat', 'Comes from a shared chat'), T('msgId', 'Message ID'), T('color', 'Chat color'), T('rawInput', 'Message as typed'),
    ]);
    const twitchBroadcaster = group('Broadcaster', [
        T('broadcastUser', 'Broadcaster display name'), T('broadcastUserName', 'Broadcaster login name'), T('broadcastUserId', 'Broadcaster ID'),
        F('broadcastIsAffiliate', 'Broadcaster is an affiliate'), F('broadcastIsPartner', 'Broadcaster is a partner'),
    ]);
    const hypeTrain = (own) => [].concat(group('Hype Train', own), group('Hype Train', [
        N('level', 'Level'), N('percent', 'Progress in the level'), N('percentDecimal', 'Progress in the level (0 to 1)'), T('trainType', 'Kind of train', { choices: TRAIN_TYPES }),
        F('isGoldenKappaTrain', 'Is a Golden Kappa train'), F('isTreasureTrain', 'Is a treasure train'), F('isSharedTrain', 'Is a shared chat train'),
        F('isInSharedChat', 'Broadcast is in a shared chat'), F('isSharedChatHost', 'Broadcaster hosts the shared chat'), T('id', 'Train ID'),
    ]), group('Top contributors', [
        T('top.bits.user', 'Top cheerer, display name'), T('top.bits.userName', 'Top cheerer, login name'), N('top.bits.total', 'Top cheerer, bits'),
        T('top.subscription.user', 'Top gift sub giver, display name'), T('top.subscription.userName', 'Top gift sub giver, login name'),
        N('top.subscription.total', 'Top gift sub giver, points (tier 1 = 500)'),
        T('top.other.user', 'Top other contributor, display name'), T('top.other.userName', 'Top other contributor, login name'), N('top.other.total', 'Top other contributor, amount'),
    ]));

    // ---- YouTube ------------------------------------------------------------------------------------------------------------------
    const youtubeViewer = group('Viewer', [
        T('user', 'Display name'), T('userName', 'Login name'), T('userId', 'User ID'), F('isSubscribed', 'Has been a member'), F('userIsSponsor', 'Is a member now'),
        F('isModerator', 'Is a moderator'),
    ]);
    const youtubeBroadcast = group('Broadcast', [
        T('broadcast.title', 'Broadcast title'), T('broadcast.status', 'Broadcast status'), T('broadcast.privacy', 'Broadcast privacy'), T('broadcast.tags', 'Broadcast tags (comma list)'),
        T('broadcast.id', 'Broadcast ID'), T('broadcastUsername', 'Broadcaster login name'), T('broadcastUserId', 'Broadcaster ID'),
    ]);

    // ---- Kick ---------------------------------------------------------------------------------------------------------------------
    const kickViewer = group('Viewer', [
        T('user', 'Display name'), T('userName', 'Login name'), T('userId', 'User ID'), T('userGroups', 'Streamer.bot groups (comma list)'),
        F('isSubscribed', 'Is a subscriber'), F('isModerator', 'Is a moderator'),
    ]);
    const kickBroadcaster = group('Broadcaster', [
        T('broadcastUser', 'Broadcaster display name'), T('broadcastUsername', 'Broadcaster login name'), T('broadcastUserId', 'Broadcaster ID'),
    ]);

    // ---- the triggers -----------------------------------------------------------------------------------------------------------
    const T_ = (id, label, platform, fields) => ({ id, label, platform, fields });
    const triggers = [
        T_('TwitchCheer', 'Cheer', 'Twitch', [].concat(group('Cheer', [N('bits', 'Bits')]), twitchViewer, twitchRole, twitchMessage, twitchBroadcaster)),
        T_('TwitchRewardRedemption', 'Channel point reward', 'Twitch', [].concat(group('Reward', [
            T('rewardName', 'Reward name'), N('rewardCost', 'Cost in channel points'), T('rewardPrompt', 'Reward description'), T('rawInput', 'Text the viewer entered'),
            N('counter', 'Times the reward was used'), N('userCounter', 'Times this viewer used it'), F('skipsQueue', 'Completes by itself'), F('requiresUserInput', 'Asks for text'),
            N('maxPerStream', 'Limit per stream'), N('maxPerUserPerStream', 'Limit per viewer per stream'), N('globalCooldown', 'Cooldown in seconds'), T('rewardId', 'Reward ID'),
            T('redemptionId', 'Redemption ID'), T('backgroundColor', 'Reward color'),
        ]), twitchViewer, twitchBroadcaster)),
        T_('TwitchSub', 'Subscription', 'Twitch', [].concat(group('Subscription', [
            T('tier', 'Tier', { choices: SUB_TIERS }), F('isMultiMonth', 'Paid for several months'), N('multiMonthDuration', 'Months paid for'), N('multiMonthTenure', 'Months of that already passed'),
        ]), twitchViewer, twitchRole, twitchMessage, twitchBroadcaster)),
        T_('TwitchReSub', 'Resubscription', 'Twitch', [].concat(group('Resubscription', [
            T('tier', 'Tier', { choices: SUB_TIERS }), N('cumulative', 'Months subscribed in all'), N('monthStreak', 'Months in a row'), F('streakShared', 'Shares the streak'),
            F('isMultiMonth', 'Paid for several months'), N('multiMonthDuration', 'Months paid for'), N('multiMonthTenure', 'Months of that already passed'),
        ]), twitchViewer, twitchRole, twitchMessage, twitchBroadcaster)),
        T_('TwitchGiftSub', 'Gift subscription', 'Twitch', [].concat(group('Gift subscription', [
            T('tier', 'Tier', { choices: PAID_TIERS }), T('recipientUser', 'Recipient display name'), T('recipientUserName', 'Recipient login name'), T('recipientId', 'Recipient ID'),
            N('monthsGifted', 'Months gifted'), N('totalSubsGifted', 'Subs gifted by this viewer in all'), F('totalSubsGiftedShared', 'Shares the total'), N('cumulativeMonths', 'Months the recipient has subscribed'),
            F('anonymous', 'Is anonymous'), F('fromGiftBomb', 'Comes from a gift bomb'), N('subBombCount', 'Subs in that gift bomb'), F('random', 'Went to a random viewer'), T('systemMessage', 'Twitch system message'),
        ]), twitchViewer, twitchBroadcaster)),
        T_('TwitchGiftBomb', 'Gift bomb', 'Twitch', [].concat(group('Gift bomb', [
            T('tier', 'Tier', { choices: PAID_TIERS }), N('gifts', 'Subs in the gift bomb'), N('totalGifts', 'Subs gifted by this viewer in all'), F('totalGiftsShared', 'Shares the total'),
            F('anonymous', 'Is anonymous'), F('bonusGifts', 'Has bonus subs'), T('systemMessage', 'Twitch system message'),
        ]), twitchViewer, twitchBroadcaster)),
        T_('TwitchRaid', 'Raid', 'Twitch', [].concat(group('Raid', [N('viewers', 'Viewers in the raid')]), twitchViewer, twitchBroadcaster)),
        T_('TwitchHypeTrainStart', 'Hype Train start', 'Twitch', [].concat(hypeTrain([N('allTimeHighLevel', 'Highest level so far'), N('allTimeHighTotal', 'Highest total so far')]), twitchBroadcaster)),
        T_('TwitchHypeTrainUpdate', 'Hype Train update', 'Twitch', [].concat(hypeTrain([]), twitchViewer, twitchBroadcaster)),
        T_('TwitchHypeTrainLevelUp', 'Hype Train level up', 'Twitch', [].concat(hypeTrain([N('prevLevel', 'Level before')]), twitchViewer, twitchBroadcaster)),
        T_('TwitchHypeTrainEnd', 'Hype Train end', 'Twitch', [].concat(hypeTrain([]), twitchBroadcaster)),
        T_('TwitchCustomPowerUpRedemption', 'Power-up (bits)', 'Twitch', [].concat(group('Power-up', [N('customPowerUp.bitsCost', 'Cost in bits'), T('rawInput', 'Text the viewer entered')]), twitchViewer, twitchBroadcaster)),

        T_('YouTubeNewSponsor', 'New member', 'YouTube', [].concat(group('Membership', [T('levelName', 'Membership level'), F('isUpgrade', 'Is an upgrade'), T('messageId', 'Event ID')]), youtubeViewer, youtubeBroadcast)),
        T_('YouTubeMemberMileStone', 'Member milestone', 'YouTube', [].concat(group('Milestone', [N('months', 'Months as a member'), T('levelName', 'Membership level'), T('message', 'Message'), T('messageId', 'Event ID')]), youtubeViewer, youtubeBroadcast)),
        T_('YouTubeMembershipGift', 'Gifted memberships', 'YouTube', [].concat(group('Gift', [N('count', 'Memberships gifted'), T('tier', 'Tier'), T('id', 'Event ID')]), youtubeViewer, youtubeBroadcast)),
        T_('YouTubeGiftMembershipReceived', 'Gift membership received', 'YouTube', [].concat(group('Gift', [
            T('tier', 'Tier'), T('gifterUser', 'Gifter display name'), T('gifterUserName', 'Gifter login name'), T('gifterUserId', 'Gifter ID'), T('id', 'Event ID'),
        ]), youtubeViewer, youtubeBroadcast)),
        T_('YouTubeSuperChat', 'Super Chat', 'YouTube', [].concat(group('Super Chat', [
            N('microAmount', 'Amount (in whole currency units)', { factor: 1000000 }), T('currencyCode', 'Currency code'), T('amount', 'Amount as shown'), N('tier', 'Tier'), T('message', 'Message'), T('messageId', 'Event ID'),
        ]), youtubeViewer, youtubeBroadcast)),
        T_('YouTubeSuperSticker', 'Super Sticker', 'YouTube', [].concat(group('Super Sticker', [
            N('microAmount', 'Amount (in whole currency units)', { factor: 1000000 }), T('currencyCode', 'Currency code'), T('amount', 'Amount as shown'), N('tier', 'Tier'), T('stickerAltText', 'Sticker description'),
            T('stickerId', 'Sticker ID'), T('stickerLanguage', 'Sticker language'), T('messageId', 'Event ID'),
        ]), youtubeViewer, youtubeBroadcast)),

        T_('KickSubscription', 'Subscription', 'Kick', [].concat(group('Subscription', [N('monthsSubscribed', 'Months subscribed'), N('duration', 'Months paid for')]), kickViewer, kickBroadcaster)),
        T_('KickResubscription', 'Resubscription', 'Kick', [].concat(group('Resubscription', [N('monthsSubscribed', 'Months subscribed'), N('duration', 'Months paid for')]), kickViewer, kickBroadcaster)),
        T_('KickGiftSubscription', 'Gift subscription', 'Kick', [].concat(group('Gift subscription', [
            T('recipient.userName', 'Recipient display name'), T('recipient.userLogin', 'Recipient login name'), T('recipient.userId', 'Recipient ID'), T('recipient.platform', 'Recipient platform'),
        ]), kickViewer, kickBroadcaster)),
        T_('KickMassGiftSubscription', 'Mass gift subscription', 'Kick', [].concat(group('Mass gift', [N('count', 'Subs gifted')]), kickViewer, kickBroadcaster)),
        T_('KickIncomingRaid', 'Raid (custom code event)', 'Kick', group('Raid', [T('user', 'Raider display name'), N('viewers', 'Viewers in the raid')])),
        T_('KickKicksGifted', 'Kicks gifted (custom code event)', 'Kick', group('Kicks', [
            N('amount', 'Kicks gifted'), T('gift', 'Gift name'), T('giftType', 'Gift type'), T('sender', 'Sender'), T('message', 'Message'),
        ])),

        T_('StreamElementsTip', 'Tip', 'StreamElements', group('Tip', [
            N('tipAmount', 'Amount'), T('tipCurrency', 'Currency code'), T('tipUsername', 'Name of the tipper'), T('tipMessage', 'Message'),
        ])),
        T_('StreamlabsDonation', 'Donation', 'Streamlabs', group('Donation', [
            N('donationAmount', 'Amount'), T('donationCurrency', 'Currency code'), T('donationFormattedAmount', 'Amount with the currency symbol'), T('donationFrom', 'Name of the donor'), T('donationMessage', 'Message'),
        ])),

        T_('FourthwallDonation', 'Donation', 'Fourthwall', group('Donation', [
            N('fw.amount', 'Amount'), T('fw.currency', 'Currency code'), T('fw.username', 'Name of the donor'), T('fw.message', 'Message'), T('fw.status', 'Status'), T('fw.donationId', 'Donation ID'), T('fw.shopId', 'Shop ID'),
        ])),
        T_('FourthwallOrderPlaced', 'Order placed', 'Fourthwall', group('Order', [
            N('fw.total', 'Order total'), N('fw.subtotal', 'Subtotal'), N('fw.shipping', 'Shipping'), N('fw.tax', 'Tax'), N('fw.donation', 'Donation added to the order'), N('fw.discount', 'Discount'),
            T('fw.currency', 'Currency code'), T('fw.username', 'Name of the buyer'), T('fw.statmessageus', "Buyer's note"), T('fw.status', 'Status'), T('fw.source', 'Kind of event'),
            T('fw.friendly', 'Short order ID'), T('fw.orderId', 'Order ID'), T('fw.checkoutId', 'Checkout ID'), T('fw.shopId', 'Shop ID'),
        ])),
        T_('FourthwallSubscriptionPurchased', 'Subscription purchased', 'Fourthwall', group('Subscription', [
            N('fw.amount', 'Amount'), T('fw.currency', 'Currency code'), T('fw.nickname', 'Name of the subscriber'), T('fw.interval', 'Interval'), T('fw.type', 'Kind of change'), T('fw.id', 'Subscription ID'), T('fw.shopId', 'Shop ID'),
        ])),
    ];

    // A rule can name a family of triggers: every trigger whose name starts with the text before the star
    const families = [
        { id: '*', label: 'Any event' },
        { id: 'Twitch*', label: 'Any Twitch event' },
        { id: 'YouTube*', label: 'Any YouTube event' },
        { id: 'Kick*', label: 'Any Kick event' },
        { id: 'StreamElements*', label: 'Any StreamElements event' },
        { id: 'Streamlabs*', label: 'Any Streamlabs event' },
        { id: 'Fourthwall*', label: 'Any Fourthwall event' },
    ];

    // The tests a condition offers for each kind of parameter: [what is stored, the words of the sentence under a rule, the words of the list of tests].
    // The third entry is there only where the list says more than the sentence: a number test shows its math symbol after the words in the list (3.0.0), and the sentence
    // keeps words only. The symbols (the code points U+2260, U+2265 and U+2264) are written as JavaScript escapes because every file of the dock holds ASCII only. The stored text never changes.
    const operators = {
        number: [['=', 'equals', 'equals (=)'], ['!=', 'does not equal', 'does not equal (\u2260)'], ['>', 'is greater than', 'is greater than (>)'],
            ['>=', 'is greater than or equal to', 'greater than or equal to (\u2265)'], ['<', 'is less than', 'is less than (<)'], ['<=', 'is less than or equal to', 'less than or equal to (\u2264)']],
        text: [['is', 'is'], ['isnot', 'is not'], ['contains', 'contains'], ['notcontains', 'does not contain'], ['starts', 'starts with'], ['ends', 'ends with'], ['empty', 'is empty'], ['notempty', 'is not empty']],
        flag: [['yes', 'is yes'], ['no', 'is no']],
    };
    // The tests that read the parameter alone, with no value to type
    const noValue = ['empty', 'notempty', 'yes', 'no'];

    return { triggers, families, operators, noValue };
})();


// ============================================================================
// Test prints with the values the person types (3.0.4)
//
// The Test card offers every trigger above. An entry of its list is a sample of the action (status.samples) or, for a trigger that has no sample, the trigger itself.
// For each trigger, `receipt` lists the values its receipt reads (the handlers of renderer.js), in the order the form shows them. Every other field of the trigger
// in ROUTE_CATALOG shows under More values. An item of `receipt` is
//   'name'                          a field of the trigger in ROUTE_CATALOG
//   { name, note }                  such a field with a sentence under it (what makes the receipt print nothing, for example)
//   { name, label, type }           a value the receipt reads that ROUTE_CATALOG leaves out
//   { money, name, shown, currency }  an amount of money (the field of the trigger): one box with two digits after the point. shown names the parameter that
//                                     holds the amount as text with its currency (Amount as shown); the form fills it from the box and the currency named by currency
//                                     and shows no box of its own for it (the owner, 15 October 2026: one Amount box)
//   { list, label }                 a list typed one entry per line, sent as indexed names:
//                                     'gift'   Twitch gift bomb: gift.recipientUser0, gift.recipientUser1, ... (one name per line)
//                                     'kick'   Kick mass gift: recipient.0.userName, recipient.1.userName, ... (one name per line)
//                                     'items'  Fourthwall order: fw.variants[0].quantity and fw.variants[0].name, ... (one item per line, such as 2 x Shirt)
// `samples` holds the values each sample of the action starts with, as the receipt page has them (SAMPLES in renderer.js, the Hype Train steps as hypeSampleStep
// brings the test train up to each of them: the bits of the top cheerer are the ones the train has counted for that cheerer by then). The end-to-end Hype Train test
// is six events and has no entry here. `defaults` holds the values of the entries of the triggers that have no sample. `long` names the texts that get a box of
// several lines.
// ============================================================================

const TEST_EVENTS = (() => {
    const own = (name, label, type) => ({ name, label, type });
    const list = (kind, label) => ({ list: kind, label });
    const note = (name, text) => ({ name, note: text });
    const money = (name, shown, currency, text) => ({ money: true, name, shown, currency, note: text });
    const bitsTop = ['top.bits.user', 'top.bits.userName', 'top.bits.total'];
    const subTop = ['top.subscription.user', 'top.subscription.userName', 'top.subscription.total'];
    const trainKind = ['trainType', 'isTreasureTrain', 'isGoldenKappaTrain'];
    const kickLogin = own('userLogin', 'Login name for the picture', 'text');

    const receipt = {
        TwitchCheer: ['bits', 'user', 'userName', 'message'],
        TwitchRewardRedemption: ['rewardName', 'rewardCost', 'userName', 'rawInput'],
        TwitchSub: ['tier', 'user', 'userName', 'multiMonthDuration'],
        TwitchReSub: ['tier', 'user', 'userName', 'cumulative', 'monthStreak', 'multiMonthDuration', 'messageStripped'],
        TwitchGiftSub: ['user', 'anonymous', 'tier', 'recipientUser', 'recipientUserName', note('fromGiftBomb', 'Yes prints nothing: the gift bomb prints one receipt for all its subs.')],
        TwitchGiftBomb: ['user', 'userName', 'anonymous', 'tier', 'gifts', 'totalGifts', list('gift', 'Recipients, one name per line')],
        TwitchRaid: ['user', 'userName', 'viewers'],
        TwitchHypeTrainStart: [].concat(trainKind, ['level', 'id'], bitsTop),
        TwitchHypeTrainUpdate: [].concat(['id', 'level'], bitsTop, subTop),
        TwitchHypeTrainLevelUp: [].concat(['id', 'level'], trainKind, bitsTop, subTop),
        TwitchHypeTrainEnd: [].concat(['id', 'level'], trainKind, bitsTop, subTop),
        TwitchCustomPowerUpRedemption: ['customPowerUp.bitsCost', 'user', 'userName', 'rawInput'],

        YouTubeNewSponsor: ['user', 'levelName', 'isUpgrade'],
        YouTubeMemberMileStone: ['user', 'levelName', 'months', 'message'],
        YouTubeMembershipGift: ['user', 'count', 'tier'],
        YouTubeGiftMembershipReceived: ['gifterUser', 'user'],
        YouTubeSuperChat: ['user', money('microAmount', 'amount', 'currencyCode'), 'currencyCode', 'message'],
        YouTubeSuperSticker: ['user', money('microAmount', 'amount', 'currencyCode'), 'currencyCode'],

        KickSubscription: ['user', kickLogin, 'monthsSubscribed', 'duration'],
        KickResubscription: ['user', kickLogin, 'monthsSubscribed', 'duration'],
        KickGiftSubscription: ['user', 'recipient.userName', 'recipient.userLogin'],
        KickMassGiftSubscription: ['user', 'count', list('kick', 'Recipients, one name per line')],
        KickIncomingRaid: ['user', 'viewers'],
        KickKicksGifted: ['sender', 'amount', 'gift', note('giftType', 'Only LEVEL_UP prints a receipt.'), 'message'],

        StreamElementsTip: ['tipUsername', money('tipAmount'), 'tipCurrency', 'tipMessage'],
        StreamlabsDonation: ['donationFrom', money('donationAmount', 'donationFormattedAmount', 'donationCurrency'), 'donationCurrency', 'donationMessage'],

        FourthwallDonation: ['fw.username', money('fw.amount'), 'fw.currency', 'fw.message'],
        FourthwallOrderPlaced: ['fw.username', money('fw.total', '', '', '0 or less prints nothing.'), 'fw.currency', list('items', 'Items, one per line, such as 2 x Shirt'), 'fw.statmessageus'],
        FourthwallSubscriptionPurchased: ['fw.nickname', money('fw.amount'), 'fw.currency'],
    };

    // ---- the samples (renderer.js SAMPLES and HYPE_STEPS)
    const names = (count, width) => Array.from({ length: count }, (_, i) => 'Viewer' + String(i + 1).padStart(width, '0'));
    const listed = (values, key, items) => { items.forEach((name, i) => { values[key(i)] = name; }); return values; };
    const bomb = (gifts, totalGifts, people) => listed({ gifts, totalGifts, tier: 'tier 1', user: 'SassyTP', userName: 'sassytp' }, i => 'gift.recipientUser' + i, people);
    const train = (level, extra) => Object.assign({ id: 'sample-train', level, trainType: 'regular' }, extra);
    const cheerer = (login, name, bits) => ({ 'top.bits.userName': login, 'top.bits.user': name, 'top.bits.total': bits });
    const gifter = (points) => ({ 'top.subscription.userName': 'sample.gifter01', 'top.subscription.user': 'Gifter01', 'top.subscription.total': points });
    const sample = (trigger, values, extra) => Object.assign({ trigger, values }, extra);

    const samples = {
        TwitchSub: sample('TwitchSub', { tier: 'prime', user: 'SassyTP', userName: 'sassytp' }),
        TwitchReSub: sample('TwitchReSub', { tier: 'tier 1', cumulative: 8, monthStreak: 5, isMultiMonth: true, multiMonthDuration: 6, multiMonthTenure: 0,
            messageStripped: 'Thanks for the stream!', user: 'SassyTP', userName: 'sassytp' }),
        TwitchCheer: sample('TwitchCheer', { bits: 100, user: 'SassyTP', userName: 'sassytp', message: 'Thanks for the stream!' }),
        // the long message: its bits are 100, or the Twitch High Roller threshold when that is higher, so that it is always a High Roller cheer
        TwitchCheerLong: sample('TwitchCheer', { bits: 100, user: 'SassyTP', userName: 'sassytp', message: Array.from({ length: 60 }, (_, i) => `<b>Line ${i + 1}</b> of 60`).join('<br>') }, { bitsAtThreshold: true }),
        TwitchRewardRedemption: sample('TwitchRewardRedemption', { rewardName: 'Receipt', rewardCost: 50, rawInput: 'Hello from channel points', user: 'SassyTP', userName: 'sassytp' }),
        TwitchRaid: sample('TwitchRaid', { viewers: 42, user: 'SassyTP', userName: 'sassytp' }),
        YouTubeSuperChat: sample('YouTubeSuperChat', { amount: '$5.00', microAmount: 5000000, currencyCode: 'USD', user: 'SassyTP', message: 'Great stream!' }),
        KickSubscription: sample('KickSubscription', { user: 'SassyTP', duration: 3 }),
        TwitchGiftBomb: sample('TwitchGiftBomb', bomb(50, 120, names(50, 2))),
        TwitchGiftBombBig: sample('TwitchGiftBomb', bomb(500, 1500, names(500, 3))),
        YouTubeNewSponsor: sample('YouTubeNewSponsor', { user: 'SassyTP', levelName: 'Super Fan', isUpgrade: false }),
        YouTubeMemberMileStone: sample('YouTubeMemberMileStone', { user: 'SassyTP', levelName: 'Super Fan', months: 6, message: 'Six months already!' }),
        YouTubeMembershipGift: sample('YouTubeMembershipGift', { user: 'SassyTP', count: 5, tier: 'Super Fan' }),
        YouTubeGiftMembershipReceived: sample('YouTubeGiftMembershipReceived', { gifterUser: 'SassyTP', user: 'Viewer01' }),
        KickGiftSubscription: sample('KickGiftSubscription', { user: 'SassyTP', 'recipient.userName': 'Viewer01', 'recipient.userLogin': '' }),
        KickMassGiftSubscription: sample('KickMassGiftSubscription', listed({ count: 5, user: 'SassyTP' }, i => 'recipient.' + i + '.userName', names(5, 2))),
        TwitchHypeTrainStart: sample('TwitchHypeTrainStart', train(1)),
        TwitchHypeTrainConductor: sample('TwitchHypeTrainUpdate', train(1, cheerer('sample.viewer01', 'Viewer01', 600))),
        TwitchHypeTrainConductorSwitch: sample('TwitchHypeTrainUpdate', train(1, cheerer('sassytp', 'SassyTP', 800))),
        TwitchHypeTrainSubConductor: sample('TwitchHypeTrainUpdate', train(1, Object.assign(cheerer('sassytp', 'SassyTP', 800), gifter(1500)))),
        TwitchHypeTrainLevelUp: sample('TwitchHypeTrainLevelUp', train(2, Object.assign({ prevLevel: 1 }, cheerer('sassytp', 'SassyTP', 800), gifter(2500)))),
        TwitchHypeTrainEnd: sample('TwitchHypeTrainEnd', train(2, Object.assign(cheerer('sassytp', 'SassyTP', 800), gifter(3500)))),
    };

    // ---- the triggers that have no sample
    const defaults = {
        TwitchGiftSub: { user: 'SassyTP', userName: 'sassytp', anonymous: false, tier: 'tier 1', recipientUser: 'Viewer01', fromGiftBomb: false },
        TwitchCustomPowerUpRedemption: { 'customPowerUp.bitsCost': 50, user: 'SassyTP', userName: 'sassytp', rawInput: 'Hello from a power-up' },
        YouTubeSuperSticker: { user: 'SassyTP', microAmount: 2000000, currencyCode: 'USD', amount: '$2.00' },
        KickResubscription: { user: 'SassyTP', monthsSubscribed: 6 },
        KickIncomingRaid: { user: 'SassyTP', viewers: 42 },
        KickKicksGifted: { sender: 'SassyTP', amount: 100, gift: 'Rage Quit', giftType: 'LEVEL_UP', message: 'Hello from Kick' },
        StreamElementsTip: { tipUsername: 'SassyTP', tipAmount: 5, tipCurrency: 'USD', tipMessage: 'For the coffee fund' },
        StreamlabsDonation: { donationFrom: 'SassyTP', donationAmount: 5, donationCurrency: 'USD', donationFormattedAmount: '$5.00', donationMessage: 'For the coffee fund' },
        FourthwallDonation: { 'fw.username': 'SassyTP', 'fw.amount': 5, 'fw.currency': 'USD', 'fw.message': 'Thanks for the stream!' },
        FourthwallOrderPlaced: { 'fw.username': 'SassyTP', 'fw.total': 20, 'fw.currency': 'USD', 'fw.variants[0].quantity': 2, 'fw.variants[0].name': 'Shirt',
            'fw.variants[1].quantity': 1, 'fw.variants[1].name': 'Mug', 'fw.statmessageus': 'Thanks for the support!' },
        FourthwallSubscriptionPurchased: { 'fw.nickname': 'SassyTP', 'fw.amount': 5, 'fw.currency': 'USD' },
    };

    const long = ['message', 'messageStripped', 'rawInput', 'rewardPrompt', 'systemMessage', 'tipMessage', 'donationMessage', 'fw.message', 'fw.statmessageus'];

    return { receipt, samples, defaults, long };
})();
