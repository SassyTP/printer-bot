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

    // The tests a condition offers for each kind of parameter: [what is stored, what the person reads]
    const operators = {
        number: [['=', 'equals'], ['!=', 'does not equal'], ['>', 'is greater than'], ['>=', 'is at least'], ['<', 'is less than'], ['<=', 'is at most']],
        text: [['is', 'is'], ['isnot', 'is not'], ['contains', 'contains'], ['notcontains', 'does not contain'], ['starts', 'starts with'], ['ends', 'ends with'], ['empty', 'is empty'], ['notempty', 'is not empty']],
        flag: [['yes', 'is yes'], ['no', 'is no']],
    };
    // The tests that read the parameter alone, with no value to type
    const noValue = ['empty', 'notempty', 'yes', 'no'];

    return { triggers, families, operators, noValue };
})();
