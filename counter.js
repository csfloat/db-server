class Counter {
    constructor(pool, counterUpdateInterval) {
        this.pool = pool;
        this.counterUpdateInterval = this.counterUpdateInterval || 30000;

        this.updateState();

        setInterval(async () => {
            await this.updateState();
        }, counterUpdateInterval || 30000);
    }

    async updateState() {
        const countRows = await this.pool.query(`SELECT n_live_tup as count FROM pg_stat_all_tables WHERE relname = 'items'`);
        const count = countRows.rows[0].count;

        const lastUpdate = Date.now()/1000;
        if (this.lastUpdate && this.count) {
            this.rateOfChange = (count-this.count)/(lastUpdate-this.lastUpdate);
        }

        this.count = count;
        this.lastUpdate = lastUpdate;
    }

    get() {
        return {
            count: parseInt(this.count),
            rate: this.rateOfChange,
            lastUpdate: this.lastUpdate,
            updateInterval: this.counterUpdateInterval/1000
        }
    }
}

module.exports = Counter;
