const request = require('request-promise');
const utils = require('./utils');

const BASE_PROFILE_SUMMARY_URL = 'http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/';

class ExpiringDictionary {
    constructor(expirationMs) {
        this.dict = {};
        this.expirationMs = expirationMs;
    }

    put(key, value) {
        this.dict[key] = {
            data: value,
            expires: Date.now() + this.expirationMs,
        }
    }

    has(key) {
        return key in this.dict && this.dict[key].expires > Date.now();
    }

    get(key) {
        if (!(key in this.dict)) return;

        if (this.dict[key].expires < Date.now()) {
            delete this.dict[key];
            return;
        }

        return this.dict[key].data;
    }
}

class ProfileFetcher {
    constructor(pool, steamApiKeys) {
        this.pool = pool;
        this.steamApiKeys = steamApiKeys;

        this.cache = new utils.ExpiringDictionary(/* 15 min */ 15 * 60 * 1000);
    }

    async getProfilesForSteamIds(steamIds) {
        const nonCachedSteamIds = steamIds.filter(steamId => !this.cache.has(steamId));

        const chunkedIds = utils.chunkArray(nonCachedSteamIds, 100);
        const requestPromises = [];

        for (const idChunk of chunkedIds) {
            requestPromises.push(request({
                uri: `${BASE_PROFILE_SUMMARY_URL}?key=${this._getRandomApiKey()}&steamids=${idChunk.join(',')}`,
                json: true
            }).catch(() => {
                console.error(`Failed to retrieve steam profile list`);
                return {};
            }));
        }

        await Promise.all(requestPromises).then(responses => {
            for (const response of responses) {
                if (!response.response || !response.response.players) {
                    continue;
                }

                for (const player of response.response.players) {
                    this.cache.put(player.steamid, player);
                }
            }
        });

        return steamIds.filter(steamId => this.cache.has(steamId))
                        .map(steamId => this.cache.get(steamId))
                        .reduce((map, profile) => {
                            map[profile.steamid] = profile;
                            return map;
                        }, {});
    }

    _getRandomApiKey() {
      return this.steamApiKeys[Math.floor(Math.random() * this.steamApiKeys.length)];
    }

    canFetch() {
        return this.steamApiKeys.length > 0;
    }
}

module.exports = ProfileFetcher;
