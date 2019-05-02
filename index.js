const config = require('./config');
const vdf = require('simple-vdf');
const fs = require('fs');
const express = require('express');
const fetch = require('node-fetch');
const { Pool } = require('pg');
const ItemParser = require('./item_parser');
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

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    next();
});

app.get('/items', (req, res) => {
    if (itemParser) {
        res.json(itemParser.getFullResponse());
    } else {
        res.status(500).json({error: 'Item response is not initialized, new csgo update?'});
    }
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
    min: 0-1
    max: 0-1

    TODO: Implement support for stickers
 */
function buildQuery(params) {
    const conditions = [], values = [];

    if (params.defIndex && isInt(params.defIndex)) {
        conditions.push(`defindex = $${conditions.length+1}`);
        values.push(params.defIndex);
    }

    if (params.paintIndex && isInt(params.paintIndex)) {
        conditions.push(`paintindex = $${conditions.length+1}`);
        values.push(params.paintIndex);
    }

    if (params.stattrak) {
        conditions.push(`stattrak = $${conditions.length+1}`);
        values.push(params.stattrak === 'true');
    }

    if (params.souvenir) {
        conditions.push(`souvenir = $${conditions.length+1}`);
        values.push(params.souvenir === 'true');
    }

    if (params.paintSeed && isInt(params.paintSeed)) {
        conditions.push(`paintseed = $${conditions.length+1}`);
        values.push(params.paintSeed);
    }

    if (params.min) {
        const min = parseFloat(params.min);

        if (min >= 0.0 && min <= 1.0) {
            const buf = Buffer.alloc(4);
            buf.writeFloatBE(min, 0);
            const intMin = buf.readInt32BE(0);

            conditions.push(`paintwear >=  $${conditions.length+1}`);
            values.push(intMin);
        }
    }

    if (params.max) {
        const max = parseFloat(params.max);

        if (max >= 0.0 && max <= 1.0) {
            const buf = Buffer.alloc(4);
            buf.writeFloatBE(max, 0);
            const intMax = buf.readInt32BE(0);

            conditions.push(`paintwear <=  $${conditions.length+1}`);
            values.push(intMax);
        }
    }


    if (params.stickers) {
        try {
            const stickers = [];

            const inputStickers = JSON.parse(params.stickers);

            for (const s of inputStickers) {
                if (!s.i) continue;

                const sticker = {
                    i: parseInt(s.i)
                };

                if (s.s) {
                    sticker.s = parseInt(s.s);
                }

                stickers.push(sticker);
            }

            // Add duplicate property (allows us to use the index to search sticker dupes)
            for (const sticker of stickers) {
                const matching = stickers.filter((s) => s.i === sticker.i);
                if (matching.length > 1 && !matching.find((s) => s.d > 1)) {
                    sticker.d = matching.length;
                }
            }

            console.log(stickers);
            conditions.push(`stickers @> $${conditions.length+1}`);
            values.push(JSON.stringify(stickers));
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


app.get('/search', async (req, res) => {
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
