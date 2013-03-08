
// nvm.sh - website code
exports = module.exports = (function() {

  var http    = require('http')
    , url     = require('url')
    , net     = require('net')
    , winston = require('winston')
    , moment  = require('moment')
    , request = require('request');

  var CURL_UA_RX   = /^curl\//i
    , HTTP_PORT    = process.env.PORT || 8080
    , GIT_PORT     = 9418
    , NVM_GIT_PATH = '/creationix/nvm.git'
    , NVM_GIT_HOST = 'github.com'
    , NVM_SH       = 'https://raw.github.com/creationix/nvm/master/install.sh'
    , NVM_GITHUB   = 'https://github.com/creationix/nvm';


  // build custom logger
  var opts =
    { colorize  : true
    , timestamp : function() { return moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'); }
    , level     : 'git'
    , levels    : { git: 7, http: 7 }
    , colors    : { git: 'blue', http: 'cyan' }
    };

  var log = new winston.Logger(opts);
  log.add(winston.transports.Console, opts);


  // HTTP server
  function handleHttp(req, resp) {
    var ua = req.headers['user-agent']
      , path = url.parse(req.url).path;

    log.http('client ' + req.connection.remoteAddress +
      ' ' + path + ' ' + ua);

    if (req.method !== 'GET' || path !== '/') {
      resp.writeHead(404);
      return resp.end();
    }

    if (CURL_UA_RX.test(ua)) {
      return request(NVM_SH).pipe(resp);

    } else { // assume generic web browser, send a redirect
      resp.writeHead(302, { 'Location': NVM_GITHUB });
      return resp.end('redirect: ' + NVM_GITHUB);
    }
  };

  var httpServer = http.createServer(handleHttp).listen(HTTP_PORT, function() {
    log.http('server', HTTP_PORT);
  });


  // GIT tcp server
  function handleGit(socket) {

    // modify git-upload-pack url to point to the official repo
    // assume first chunk is always git-upload-pack
    function modifyUploadPath(chunk) {

      // find the second \0 which terminates the git-upload-pack command (and host= too)
      function findTerminator(chunk) {
        var i = 0, first = true;

        for (i = 0; i < chunk.length; i++) {
          if (chunk[i] !== 0) continue;
          if (!first) return i;

          first = false;
        }

        return -1;
      }

      var i           = 0
        , replacement = '0038git-upload-pack /creationix/nvm.git\0host=github.com\0'
        , zeroIndex   = findTerminator(chunk)
        , rest        = chunk.slice(zeroIndex + 1, chunk.length);

      if (zeroIndex < 0) return null;
      return Buffer.concat([new Buffer(replacement), rest]);
    };

    var client = net.connect(GIT_PORT, NVM_GIT_HOST);
    log.git('client ' + socket.remoteAddress);

    client.pipe(socket);
    socket.once('data', function(chunk) {
      chunk = modifyUploadPath(chunk);

      if (!chunk) {
        socket.end();
        client.end();
        return;
      }

      // continue with native pipe so we have back pressure handling
      client.write(chunk);
      socket.pipe(client);
    });
  }

  var gitServer = net.createServer(handleGit).listen(GIT_PORT, function() {
    log.git('server', GIT_PORT);
  });


  return { http: httpServer, git: gitServer };

})();

