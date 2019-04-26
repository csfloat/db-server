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


app.get('/items', (req, res) => {
    if (itemParser) {
        res.json(itemParser.getFullResponse());
    } else {
        res.status(500).json({error: 'Item response is not initialized, new csgo update?'});
    }
});

/*
    Possible URL Query Params

    defIndex: Weapon index
    paintIndex: Paint index
    order: 1 for asc, -1 for desc
    stattrak: true/false
    souvenir: true/false

    TODO: Implement support for stickers
 */
function buildQuery(params) {
    const conditions = [], values = [];

    if (params.defIndex) {
        conditions.push(`defindex = $${conditions.length+1}`);
        values.push(params.defIndex);
    }

    if (params.paintIndex) {
        conditions.push(`paintindex = $${conditions.length+1}`);
        values.push(params.paintIndex);
    }

    if (params.stattrak) {
        conditions.push(`stattrak = $${conditions.length+1}`);
        values.push(params.stattrak);
    }

    if (params.souvenir) {
        conditions.push(`souvenir = $${conditions.length+1}`);
        values.push(params.souvenir);
    }

    let statement;
    if (conditions.length > 0) {
        statement = `SELECT * FROM items ORDER BY paintwear ${params.order === -1 ? 'DESC' : ''} LIMIT 200`;
    } else {
        statement = `SELECT * FROM items ${conditions.length > 0 ? 'WHERE' : ''} ${conditions.join(' AND ')}
                ORDER BY paintwear ${params.order === -1 ? 'DESC' : ''} LIMIT 200`;
    }

    return {
        text: statement,
        values
    }
}

app.get('/search', async (req, res) => {
    const query = buildQuery(req.params);

    try {
        const results = await pool.query(query);
        res.json(results.rows);
    } catch (e) {
        console.error(e);
        res.status(400).json({error: 'Something went wrong'});
    }
});

app.listen(config.port, () => console.log(`Listening on Port ${config.port}`));
