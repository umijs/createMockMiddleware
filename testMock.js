const express = require('express');
const path = require('path');
const getMockMiddleware = require('./index').default;
var app = express();
app.use(getMockMiddleware(path.join(__dirname, '/')));

app.listen(3000);
console.log('look in http://localhost:3000/');
