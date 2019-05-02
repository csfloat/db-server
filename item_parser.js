class ItemParser {
    constructor(itemsGame, language) {
        this.itemsGame = itemsGame;
        this.language = language;
    }

    _getPrefabStickerAmount(prefabName) {
        const prefab = this.itemsGame.prefabs[prefabName];
        return Object.keys(prefab.stickers || {}).length;
    }

    _isWeapon(prefabName) {
        if (prefabName === 'melee_unusual') return true;

        const prefab = this.itemsGame.prefabs[prefabName];
        const usedClasses = prefab && prefab.used_by_classes;

        return usedClasses && (usedClasses['terrorists'] || usedClasses['counter-terrorists']);
    }

    _getWeapons() {
        const weapons = {};
        for (const defIndex in this.itemsGame.items) {
            const item = this.itemsGame.items[defIndex];
            if (item.prefab && this._isWeapon(item.prefab)) {
                weapons[defIndex] = item;
            }
        }

        return weapons;
    }

    _getWeaponLanguageName(defIndex) {
        const item = this.itemsGame.items[defIndex];

        if (item.item_name) {
            return this._getLanguageValue(item.item_name);
        } else {
            const prefab = this.itemsGame.prefabs[item.prefab];
            return this._getLanguageValue(prefab.item_name);
        }
    }

    _getPaintKitIndex(name) {
        return Object.keys(this.itemsGame.paint_kits).find((paintIndex) => {
            const kit = this.itemsGame.paint_kits[paintIndex];

            if (kit.name === name) {
                return true;
            }
        })
    }

    _getLanguageValue(token) {
        return this.language[token.replace('#', '')];
    }

    _getWeaponPaints(weaponName) {
        const paints = {};

        for (const iconId of Object.keys(this.itemsGame.alternate_icons2.weapon_icons)) {
            const iconPath = this.itemsGame.alternate_icons2.weapon_icons[iconId].icon_path;
            if (iconPath.indexOf(weaponName) === -1) continue;

            const parsed = iconPath.match(/econ\/default_generated\/(.*)_/)[1];
            const paintName = parsed.replace(`${weaponName}_`, '');

            const index = this._getPaintKitIndex(paintName);

            if (index) {
                const kit = this.itemsGame.paint_kits[index];
                paints[index] = {
                    name: this._getLanguageValue(kit.description_tag),
                    min: parseFloat(kit.wear_remap_min || 0.06),
                    max: parseFloat(kit.wear_remap_max || 0.80),
                };
            }
        }

        return paints;
    }

    getStickers() {
        const stickers = {};

        for (const stickerId of Object.keys(this.itemsGame.sticker_kits)) {
            if (stickerId == '0') continue;

            const sticker = this.itemsGame.sticker_kits[stickerId];

            stickers[stickerId] = this._getLanguageValue(sticker.item_name)
        }

        return stickers;
    }

    getFullResponse() {
        if (this.resp) return this.resp;

        const resp = {};

        const weapons = this._getWeapons();

        const weaponsResp = {};

        for (const defIndex of Object.keys(weapons)) {
            const weapon = weapons[defIndex];
            const paints = this._getWeaponPaints(weapon.name);

            if (Object.keys(paints).length === 0) continue;

            weaponsResp[defIndex] = {
                name: this._getWeaponLanguageName(defIndex),
                stickerAmount: this._getPrefabStickerAmount(weapon.prefab),
                paints
            };
        }

        resp.weapons = weaponsResp;
        resp.stickers = this.getStickers();

        this.resp = resp;

        return resp;
    }
}

module.exports = ItemParser;
