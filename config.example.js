module.exports = {
    port: 80,
    // amount of seconds between updating game files
    file_update_interval: 30 * 60 * 1000,
    // postgres connection string
    connectionString: '<POSTGRES_CONNECTION>',
    allowed_regex_origins: [],
    allowed_origins: [],
    search_rate_window: 2 * 60 * 60 * 1000, // 2 hours
    search_rate_limit: 120,
    trust_proxy: false,
    steam_api_keys: [],
    steam_cache_expiring_ms: 15 * 60 * 1000, // 15 min, web api cache expiry time
    max_query_items: 200, // max items returned for query
};
