#!/bin/bash

if [ ! -f /config/config.js ]; then
    cp /usr/src/csgofloat-db/config.example.js /config/config.js
    echo "Copied example config file to /config/config.js, please edit this file and restart"
    exit 1
fi

node index.js -c /config/config.js
