class ExpiringDictionary {
    constructor(expirationMs) {
        this.dict = {};
        this.expirationMs = expirationMs;

        setInterval(() => this.cleanup(), expirationMs);
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

    cleanup() {
        for (const key of Object.keys(this.dict)) {
            if (this.dict[key].expires < Date.now()) {
                delete this.dict[key];
            }
        }
    }
}

module.exports.ExpiringDictionary = ExpiringDictionary;

module.exports.chunkArray = (arr, size) => arr.reduce((chunks, el, i) => (i % size
                                            ? chunks[chunks.length - 1].push(el)
                                            : chunks.push([el])) && chunks, []);
