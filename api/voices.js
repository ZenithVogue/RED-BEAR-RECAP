/* ============================================================
   GET /api/voices — voice persona catalogue

   Thin serverless wrapper: Vercel/Netlify detect this file as a Node
   function. `server.js` routes to the same handler locally.
   ============================================================ */
"use strict";

module.exports = require("./tts").handleTts;
