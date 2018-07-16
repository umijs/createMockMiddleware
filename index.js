"use strict";

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _require = require("fs"),
    existsSync = _require.existsSync;

var _require2 = require("path"),
    join = _require2.join;

var bodyParser = require("body-parser");
var glob = require("glob");
var assert = require("assert");
var chokidar = require("chokidar");
var pathToRegexp = require("path-to-regexp");
var register = require("@babel/register");
var debug = console.log;

var VALID_METHODS = ["get", "post", "put", "patch", "delete"];
var BODY_PARSED_METHODS = ["post", "put", "patch"];

function getMockMiddleware(path) {
  var absMockPath = join(path, "mock");
  var absConfigPath = join(path, ".umirc.mock.js");
  register({
    presets: ["umi"],
    plugins: [require.resolve("babel-plugin-add-module-exports"), require.resolve("@babel/plugin-transform-modules-commonjs")],
    babelrc: false,
    only: [absMockPath]
  });

  var mockData = getConfig();
  watch();

  function watch() {
    if (process.env.WATCH_FILES === "none") return;
    var watcher = chokidar.watch([absConfigPath, absMockPath], {
      ignoreInitial: true
    });
    watcher.on("all", function (event, file) {
      debug("[" + event + "] " + file + ", reload mock data");
      mockData = getConfig();
    });
  }

  function getConfig() {
    cleanRequireCache();
    var ret = null;
    if (existsSync(absConfigPath)) {
      debug("load mock data from " + absConfigPath);
      ret = require(absConfigPath); // eslint-disable-line
    } else {
      var mockFiles = glob.sync("**/*.js", {
        cwd: absMockPath
      });
      debug("load mock data from " + absMockPath + ", including files " + JSON.stringify(mockFiles));
      ret = mockFiles.reduce(function (memo, mockFile) {
        memo = _extends({}, memo, require(join(absMockPath, mockFile)));
        return memo;
      }, {});
    }
    return normalizeConfig(ret);
  }

  function parseKey(key) {
    var method = "get";
    var path = key;
    if (key.indexOf(" ") > -1) {
      var splited = key.split(" ");
      method = splited[0].toLowerCase();
      path = splited[1]; // eslint-disable-line
    }
    assert(VALID_METHODS.includes(method), "Invalid method " + method + " for path " + path + ", please check your mock files.");
    return {
      method: method,
      path: path
    };
  }

  function createHandler(method, path, handler) {
    return function (req, res, next) {
      if (BODY_PARSED_METHODS.includes(method)) {
        bodyParser.json({ limit: "5mb", strict: false })(req, res, function () {
          bodyParser.urlencoded({ limit: "5mb", extended: true })(req, res, function () {
            sendData();
          });
        });
      } else {
        sendData();
      }

      function sendData() {
        if (typeof handler === "function") {
          handler(req, res, next);
        } else {
          res.json(handler);
        }
      }
    };
  }

  function normalizeConfig(config) {
    return Object.keys(config).reduce(function (memo, key) {
      var handler = config[key];
      var type = typeof handler === "undefined" ? "undefined" : _typeof(handler);
      assert(type === "function" || type === "object", "mock value of " + key + " should be function or object, but got " + type);

      var _parseKey = parseKey(key),
          method = _parseKey.method,
          path = _parseKey.path;

      var keys = [];
      var re = pathToRegexp(path, keys);
      memo.push({
        method: method,
        path: path,
        re: re,
        keys: keys,
        handler: createHandler(method, path, handler)
      });
      return memo;
    }, []);
  }

  function cleanRequireCache() {
    Object.keys(require.cache).forEach(function (file) {
      if (file === absConfigPath || file.indexOf(absMockPath) > -1) {
        delete require.cache[file];
      }
    });
  }

  function matchMock(req) {
    var exceptPath = req.path;

    var exceptMethod = req.method.toLowerCase();
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = mockData[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var mock = _step.value;
        var method = mock.method,
            re = mock.re,
            keys = mock.keys;

        if (method === exceptMethod) {
          var match = re.exec(req.path);
          if (match) {
            var params = {};

            for (var i = 1; i < match.length; i = i + 1) {
              var key = keys[i - 1];
              var prop = key.name;
              var val = decodeParam(match[i]);

              if (val !== undefined || !hasOwnProperty.call(params, prop)) {
                params[prop] = val;
              }
            }
            req.params = params;
            return mock;
          }
        }
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    function decodeParam(val) {
      if (typeof val !== "string" || val.length === 0) {
        return val;
      }

      try {
        return decodeURIComponent(val);
      } catch (err) {
        if (err instanceof URIError) {
          err.message = "Failed to decode param ' " + val + " '";
          err.status = err.statusCode = 400;
        }

        throw err;
      }
    }

    return mockData.filter(function (_ref) {
      var method = _ref.method,
          re = _ref.re;

      return method === exceptMethod && re.test(exceptPath);
    })[0];
  }

  return function (req, res, next) {
    var match = matchMock(req);

    if (match) {
      debug("mock matched: [" + match.method + "] " + match.path);
      return match.handler(req, res, next);
    } else {
      return next();
    }
  };
}
module.exports = getMockMiddleware;