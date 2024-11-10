require("dotenv").config()
const bulk = require("./bulkDownload.js")
const git = require("isomorphic-git")
const fs = require("fs")

if (!fs.existsSync("./git/")) fs.mkdirSync("./git/");

