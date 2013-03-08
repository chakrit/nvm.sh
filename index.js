
// nvm.sh - website code
exports = module.exports = (function() {

  var http    = require('http')
    , url     = require('url')
    , net     = require('net')
    , request = require('request');

  var CURL_UA_RX      = /^curl\//i
    , HTTP_PORT       = process.env.PORT || 8080
    , GIT_PORT        = 9418
    , NVM_GIT_PATH    = '/creationix/nvm.git'
    , NVM_GIT_HOST    = 'github.com'
    , NVM_SH          = 'https://raw.github.com/creationix/nvm/master/install.sh'
    , NVM_GITHUB      = 'https://github.com/creationix/nvm';

  // HTTP server
  function handleHttp(req, resp) {
    var ua = req.headers['user-agent']
      , path = url.parse(req.url).path
      , redir = CURL_UA_RX.test(ua) ? NVM_SH : NVM_GITHUB;

    if (path !== '/') {
      resp.writeHead(404);
      return resp.end();
    }

    resp.writeHead(302, { 'Location': redir });
    resp.end();
  };

  var httpServer = http.createServer(handleHttp).listen(HTTP_PORT, function() {
    console.log('http on ' + HTTP_PORT);
  });

  // GIT tcp server
  function handleGit(socket) {
    var client = net.connect(GIT_PORT, NVM_GIT_HOST);

    // modify git-upload-pack url
    // assume first chunk always contains git-upload-pack
    function modifyUploadPath(chunk) {
      var i = 0, zeroIndex = -1; // git protocols are \0-terminated

      // find the second \0 which terminates the git-upload-pack command
      for (i = 0; i < chunk.length; i++) {
        if (chunk[i] !== 0) continue;

        if (zeroIndex === -1) {
          zeroIndex = -2;
        } else if (zeroIndex === -2) {
          zeroIndex = i;
          break;
        }
      }

      if (zeroIndex < 0) {
        socket.end()
        client.end()
        return console.log('unsupported mode');
      }

      console.log(zeroIndex);

      var replacement = '0038git-upload-pack /creationix/nvm.git\0host=github.com\0'
        , rest = chunk.slice(zeroIndex + 1, chunk.length);

      // defer further reads to node.js native pipe
      chunk = Buffer.concat([new Buffer(replacement), rest]);

      client.write(chunk);
      socket.pipe(client);
    };

    socket.once('data', modifyUploadPath);
    client.pipe(socket);

    var fs      = require('fs')
      , outFile = fs.createWriteStream('/tmp/git.out')
      , inFile  = fs.createWriteStream('/tmp/git.in')

    socket.pipe(outFile);
    socket.pipe(process.stdout);
    client.pipe(inFile);
  }

  var gitServer = net.createServer(handleGit).listen(GIT_PORT, function() {
    console.log('git on ' + GIT_PORT);
  });

  return { http: httpServer, git: gitServer };

})();

