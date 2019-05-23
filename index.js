const optionDefinitions = [
    { name: 'config', alias: 'c', type: String, defaultValue: './config' } // base file path directory
];

const args = require('command-line-args')(optionDefinitions);
const config = require(args.config);
const vdf = require('simple-vdf');
const rateLimit = require("express-rate-limit");
const fs = require('fs');
const express = require('express');
const fetch = require('node-fetch');
const { Pool } = require('pg');
const ItemParser = require('./item_parser');
const Counter = require('./counter');
const app = express();

const pool = new Pool({
    connectionString: config.connectionString,
});

let itemParser;

const itemUrl = `https://raw.githubusercontent.com/SteamDatabase/GameTracking-CSGO/master/csgo/scripts/items/items_game.txt`;
const englishUrl = `https://raw.githubusercontent.com/SteamDatabase/GameTracking-CSGO/master/csgo/resource/csgo_english.txt`;

async function updateItems() {
    try {
        const resp = await fetch(itemUrl);
        const data = await resp.text();
        fs.writeFile('items_game.txt', data, () => {
            console.log('Saved items_game.txt');
        });

        const langResp = await fetch(englishUrl);
        const langData = await langResp.text();
        fs.writeFile('csgo_english.txt', langData, () => {
            console.log('Saved csgo_english.txt');
        });

        itemParser = new ItemParser(vdf.parse(data).items_game, vdf.parse(langData).lang.Tokens);
    } catch (e) {
        console.error(e);
    }
}

if (fs.existsSync('items_game.txt') && fs.existsSync('items_game.txt')) {
    const itemsGame = fs.readFileSync('items_game.txt', 'utf8');
    itemParser = new ItemParser(vdf.parse(itemsGame)['items_game']);

    const english = fs.readFileSync('csgo_english.txt', 'utf8');
    itemParser = new ItemParser(vdf.parse(itemsGame).items_game, vdf.parse(english).lang.Tokens);
} else {
    updateItems();
}

setInterval(() => updateItems(), config.file_update_interval);

if (config.trust_proxy) {
    app.enable('trust proxy');
}

config.allowed_regex_origins = config.allowed_regex_origins || [];
config.allowed_origins = config.allowed_origins || [];
const allowedRegexOrigins = config.allowed_regex_origins.map((origin) => new RegExp(origin));

function EnsureOrigin(req, res, next) {
    // Allow some origins
    if ((config.allowed_origins.length > 0 || config.allowed_regex_origins.length > 0)) {
        // check to see if its a valid domain
        const allowed = config.allowed_origins.indexOf(req.get('origin')) > -1 ||
            allowedRegexOrigins.findIndex((reg) => reg.test(req.get('origin'))) > -1;

        if (allowed) {
            res.header('Access-Control-Allow-Origin', req.get('origin'));
            res.header('Access-Control-Allow-Methods', 'GET');
            next();
        } else {
            res.status(400).json({error: 'Invalid request'});
        }
    }
}

app.use(EnsureOrigin);

app.get('/items', (req, res) => {
    if (itemParser) {
        res.json(itemParser.getFullResponse());
    } else {
        res.status(500).json({error: 'Item response is not initialized, new csgo update?'});
    }
});


const counter = new Counter(pool);
app.get('/count', (req, res) => {
    res.json(counter.get());
});

function isInt(i) {
    return !isNaN(parseInt(i));
}

/*
    Possible URL Query Params

    defIndex: Weapon index
    paintIndex: Paint index
    order: 1 for asc, -1 for desc
    stattrak: true/false
    souvenir: true/false
    paintseed: 0-999
    rarity: 1-7
    min: 0-1
    max: 0-1
    stickers: [{i: stickerId, s: slot number}]
 */
function buildQuery(params) {
    const conditions = [], values = [];
    let conditionIndex = 0;

    if (params.defIndex && isInt(params.defIndex)) {
        conditions.push(`defindex = $${++conditionIndex}`);
        values.push(params.defIndex);
    }

    if (params.paintIndex && isInt(params.paintIndex)) {
        conditions.push(`paintindex = $${++conditionIndex}`);
        values.push(params.paintIndex);
    }

    if (params.stattrak) {
        conditions.push(`stattrak = $${++conditionIndex}`);
        values.push(params.stattrak === 'true');
    }

    if (params.souvenir) {
        conditions.push(`souvenir = $${++conditionIndex}`);
        values.push(params.souvenir === 'true');
    }

    if (params.paintSeed && isInt(params.paintSeed)) {
        conditions.push(`paintseed = $${++conditionIndex}`);
        values.push(params.paintSeed);
    }

    if (params.min) {
        const min = parseFloat(params.min);

        if (min >= 0.0 && min <= 1.0) {
            const buf = Buffer.alloc(4);
            buf.writeFloatBE(min, 0);
            const intMin = buf.readInt32BE(0);

            conditions.push(`paintwear >=  $${++conditionIndex}`);
            values.push(intMin);
        }
    }

    if (params.max) {
        const max = parseFloat(params.max);

        if (max >= 0.0 && max <= 1.0) {
            const buf = Buffer.alloc(4);
            buf.writeFloatBE(max, 0);
            const intMax = buf.readInt32BE(0);

            conditions.push(`paintwear <=  $${++conditionIndex}`);
            values.push(intMax);
        }
    }

    if (params.rarity && isInt(params.rarity)) {
        conditions.push(`rarity = $${++conditionIndex}`);
        values.push(params.rarity);
    }

    if (params.stickers) {
        try {
            const stickers = [];
            const uniqueIds = new Set();

            const inputStickers = JSON.parse(params.stickers);

            for (const s of inputStickers) {
                if (!s.i) continue;

                const sticker = {
                    i: parseInt(s.i)
                };

                uniqueIds.add(s.i);

                if (s.s !== undefined) {
                    sticker.s = parseInt(s.s);
                }

                stickers.push(sticker);
            }

            // This seems to force postgres to use the i_stickers index if > 1 stickers, otherwise it sometimes uses
            // the i_paintwear index and filters rows which is substantially slower if we put it all in one array
            for (const s of stickers) {
                conditions.push(`stickers @> $${++conditionIndex}`);
                values.push(JSON.stringify([s]));
            }

            // Yes, I know this seems strange, why add the same value twice if there's only one sticker?
            // This seems to get postgres' query planner to use the i_stickers index instead of i_paintwear
            // when there's only one sticker, which is way faster
            if (stickers.length === 1) {
                conditions.push(`stickers @> $${++conditionIndex}`);
                values.push(JSON.stringify([stickers[0]]));
            }

            let totalDuplicates = 0;

            // Add duplicate property (allows us to use the index to search sticker dupes)
            for (const sticker of stickers) {
                const matching = stickers.filter((s) => s.i === sticker.i);
                if (matching.length > 1 && !matching.find((s) => s.d > 1)) {
                    sticker.d = matching.length;
                    totalDuplicates += sticker.d;
                }
            }

            // Patch to ensure that if a user wants to search 2 of a same sticker, we'd also include guns with 2 or more
            // of the same one
            // Unfortunately the DB is designed to only store the highest amount of one sticker
            for (const sticker of stickers) {
                if (inputStickers.length === 1) continue;
                if (!sticker.d) continue;

                const possibleExtra = 5 - uniqueIds.size + 1 - sticker.d;

                const conds = [];
                // Amount of possible stickers
                for (let i = 0; i < possibleExtra+1; i++) {
                    conds.push(`stickers @> $${++conditionIndex}`);
                    values.push(JSON.stringify([{i: sticker.i, d: sticker.d+i}]));
                }

                conditions.push(`(${conds.join(' OR ')})`);
            }
        } catch (e) {
            console.error(e);
        }
    }

    const statement = `SELECT * FROM items ${conditions.length > 0 ? 'WHERE' : ''} ${conditions.join(' AND ')}
                ORDER BY paintwear ${params.order === '-1' ? 'DESC' : ''} LIMIT 200`;

    return {
        text: statement,
        values
    }
}

/*
    Converts the given unsigned 64 bit integer into a signed 64 bit integer
 */
function unsigned64ToSigned(num) {
    const mask = 1n << 63n;
    return (BigInt(num)^mask) - mask;
}

/*
    Converts the given signed 64 bit integer into an unsigned 64 bit integer
 */
function signed64ToUnsigned(num) {
    const mask = 1n << 63n;
    return (BigInt(num)+mask) ^ mask;
}

function isSteamId64(id) {
    id = BigInt(id);
    const universe = id >> 56n;
    if (universe > 5n) return false;

    const instance = (id >> 32n) & (1n << 20n)-1n;

    // There are currently no documented instances above 4, but this is for good measure
    return instance <= 32n;
}

const searchLimiter = rateLimit({
    windowMs: config.search_rate_window || 2 * 60 * 60 * 1000, // 2 hours
    max: config.search_rate_limit || 120,
    headers: false,
    handler: function (req, res) {
        const timeLeft = msToTime((req.rateLimit.resetTime.getTime() - new Date().getTime()));

        res.status(429).json({error: `Rate limit exceeded, please try again in ${timeLeft}`});
    }
});

app.get('/search', searchLimiter, async (req, res) => {
    const query = buildQuery(req.query);

    try {
        const results = await pool.query(query);
        const rows = results.rows.map((row) => {
            const buf = Buffer.alloc(4);
            buf.writeInt32BE(row.paintwear, 0);
            const floatvalue = buf.readFloatBE(0);

            const a = signed64ToUnsigned(row.a).toString();
            const d = signed64ToUnsigned(row.d).toString();
            const ms = signed64ToUnsigned(row.ms).toString();
            let m = '0', s = '0';

            if (isSteamId64(ms)){
                s = ms;
            } else {
                m = ms;
            }

            return {
                s,
                a,
                d,
                m,
                floatvalue,
                props: row.props,
                souvenir: row.souvenir,
                stattrak: row.stattrak,
                stickers: row.stickers,
                updated: row.updated,
                paintseed: row.paintseed,
                defIndex: row.defindex,
                paintIndex: row.paintindex,
            }
        });

        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(400).json({error: 'Something went wrong'});
    }
});

app.listen(config.port, () => console.log(`Listening on Port ${config.port}`));
