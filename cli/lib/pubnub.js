/*
 * Copyright (c) 2014 Pixel Flavor LLC. All Rights Reserved.
 * Please see the LICENSE file included with this distribution for details.
 */

var pubnub = require('pubnub');

var config = require('./config');

module.exports = pubnub.init({
    publish_key: config.pubnubKeys.pubKey,
    subscribe_key: config.pubnubKeys.subKey
});