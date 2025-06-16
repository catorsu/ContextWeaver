// Setup file for Jest tests
// JSDOM, the environment Jest uses for DOM testing, does not include
// TextEncoder and TextDecoder by default. These are provided by browsers
// and Node.js, so we polyfill them here for test compatibility.
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;