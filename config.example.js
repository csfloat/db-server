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
};
