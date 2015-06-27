var spawn = require('child_process').spawn
var async = require('async')
var DataUri = require('datauri')
var glob = require('glob')
var fs = require('fs')
var nconf = require('nconf')
var WebSocket = require('ws')

var config = nconf.argv().env().file({
  file: 'config.json'
})
var ws = new WebSocket(config.get('HUB_URL'))
var vidProc

ws.on('open', function () {
  console.log('connected')
  ws.send(JSON.stringify({
    channel: 'sender'
  }))
  beginRecording()
})

function beginRecording () {
  vidProc = spawn('raspivid', [
    '-n',
    '-w', 640,
    '-h', 480,
    '-fps', 11,
    '-s',
    '-t', 0,
    '-i', 'pause',
    '-o', 'vid.h264'
  ]).on('close', convertImages)
  setTimeout(recordVideo, 1000)
}

function recordVideo () {
  vidProc.kill('SIGUSR1')
  setTimeout(function () {
    vidProc.kill()
  }, 2000)
}

function convertImages () {
  spawn('avconv', [
    '-f', 'h264',
    '-i', 'vid.h264',
    '-f', 'image2',
    '%d.jpg'
  ]).on('close', getImageFilenames)
}

function getImageFilenames () {
  glob('./*.jpg', readUris)
}

function readUris (err, filenames) {
  if (err) {
    return console.log(err)
  }
  async.parallel(filenames.map(imageReader), function (err, uris) {
    if (err) {
      return console.log(err)
    }
    sendImages(filenames, uris)
  })
}

function imageReader (filename) {
  return function (callback) {
    var uri = new DataUri()
    uri.on('encoded', function (content) {
      callback(null, content)
    })
    uri.encode(filename)
  }
}

function sendImages (filenames, uris) {
  ws.send(JSON.stringify({
    text: '',
    images: uris
  }), function (err) {
    if (err) {
      return console.log(err)
    }
    console.log('images sent')
    cleanup(filenames)
  })
}

function cleanup (filenames) {
  async.parallel(filenames.map(imageRemover), beginRecording)
}

function imageRemover (filename) {
  return function (callback) {
    fs.unlink(filename, callback)
  }
}
