# createMockMiddleware
Express umi mock middleware

use:
```
const express = require('express');
const path = require('path');
const getMockMiddleware = require('./index');
var app = express();

//Looking for the mock below the path
app.use(getMockMiddleware(path.join(__dirname, '/')));

app.listen(3000);
console.log('look in http://localhost:3000/');
```