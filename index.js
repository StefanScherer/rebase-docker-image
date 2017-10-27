'use strict';

const async = require('async');
const request = require('request');
const sha256 = require('sha256');

const username = process.env.DOCKER_USER || 'username';
const password = process.env.DOCKER_PASS || 'password';

const commandLineArgs = require('command-line-args');

const optionDefinitions = [
  { name: 'verbose', alias: 'v', type: Boolean },
  { name: 'src', alias: 's', type: String, defaultOption: true },
  { name: 'target', alias: 't', type: String },
  { name: 'base', alias: 'b', type: String },
  { name: 'help', alias: 'h', type: Boolean }
];

const options = commandLineArgs(optionDefinitions);

const showUsage = () => {
  console.log('Usage: rebase-docker-image src -t target -b base');
  process.exit(1);
};

const parseImageArg = imagename => {
  let found = imagename.match(/^([^\/:]+)\/([^:]+):(.*)$/);
  if (found) {
    return { org: found[1], image: found[2], tag: found[3] };
  }
  found = imagename.match(/^([^\/:]+)\/([^:]+)$/);
  if (found) {
    return { org: found[1], image: found[2], tag: 'latest' };
  }
  found = imagename.match(/^([^\/:]+):(.*)$/);
  if (found) {
    return { org: 'library', image: found[1], tag: found[2] };
  }
  return { org: 'library', image: imagename, tag: 'latest' };
};

const parseArgs = () => {
  if (options.help) {
    showUsage();
  }

  if (!options.src) {
    console.log('Error: src image missing.');
    showUsage();
  }

  if (!options.target) {
    console.log('Error: target image missing.');
    showUsage();
  }

  if (!options.base) {
    console.log('Error: base image missing.');
    showUsage();
  }

  options.images = {};
  options.images.src = parseImageArg(options.src);
  options.images.target = parseImageArg(options.target);
  options.images.base = parseImageArg(options.base);

  console.log(options);
};

parseArgs();

let bearer;
let manifest;
let digest;
let config;
let upload;

const getToken = callback => {
  request(
    `https://auth.docker.io/token?account=${username}&scope=repository%3A${options.images.src.org}%2F${options.images.src.image}%3Apull&service=registry.docker.io`,
    {
      json: true,
      auth: {
        username,
        password,
        sendImmediately: false
      }
    },
    (err, res, body) => {
      if (err) {
        return callback(err);
      }
      bearer = body.token;
      callback(null);
    }
  );
};

const getManifest = callback => {
  request(
    {
      url: `https://registry-1.docker.io/v2/${options.images.src.org}/${options.images.src.image}/manifests/${options.images.src.tag}`,
      auth: {
        bearer
      },
      json: true,
      headers: {
        Accept: 'application/vnd.docker.distribution.manifest.v2+json'
      }
    },
    (err, res, body) => {
      if (err) {
        return callback(err);
      }
      manifest = body;
      digest = manifest.config.digest;
      callback(null);
    }
  );
};

const getConfig = callback => {
  request(
    {
      url: `https://registry-1.docker.io/v2/${options.images.src.org}/${options.images.src.image}/blobs/${digest}`,
      auth: {
        bearer
      },
      json: true
    },
    (err, res, body) => {
      if (err) {
        return callback(err);
      }
      if (options.verbose) {
        console.log('os:', body.os, 'os.version:', body['os.version']);
        console.log('diff_ids:', body.rootfs.diff_ids);
      }
      config = body;
      callback(null);
    }
  );
};

const getPushToken = callback => {
  request(
    `https://auth.docker.io/token?account=${username}&scope=repository%3A${options.images.target.org}%2F${options.images.target.image}%3Apush%2Cpull&service=registry.docker.io`,
    {
      json: true,
      auth: {
        username,
        password,
        sendImmediately: true
      }
    },
    (err, res, body) => {
      if (err) {
        return callback(err);
      }
      bearer = body.token;
      callback(null);
    }
  );
};

const beginUpload = callback => {
  request(
    {
      method: 'POST',
      url: `https://registry-1.docker.io/v2/${options.images.target.org}/${options.images.target.image}/blobs/uploads/`,
      auth: {
        bearer
      }
    },
    (err, res, body) => {
      if (err) {
        return callback(err);
      }
      if (res.statusCode !== 202) {
        return callback(new Error(body));
      }
      upload = res.headers.location;
      callback(null);
    }
  );
};

const uploadConfig = callback => {
  config['os.version'] = '10.0.14393.1770';
  let data = JSON.stringify(config);
  manifest.config.digest = 'sha256:' + sha256(data);
  manifest.config.size = data.length;
  if (config.verbose) {
    console.log('config:', config);
    console.log('new digest:', manifest.config.digest);
  }
  request(
    {
      method: 'PUT',
      url: `${upload}&digest=${manifest.config.digest}`,
      auth: {
        bearer
      },
      json: true,
      body: config
    },
    (err, res, body) => {
      if (err) {
        return callback(err);
      }
      if (res.statusCode !== 201) {
        return callback(new Error(body));
      }
      if (options.verbose) {
        console.log(res.statusCode);
        //          console.log(res);
      }
      callback(null);
    }
  );
};

const checkConfigBlob = callback => {
  request(
    {
      method: 'HEAD',
      url: `https://registry-1.docker.io/v2/${options.images.target.org}/${options.images.target.image}/blobs/${manifest.config.digest}`,
      auth: {
        bearer
      }
    },
    (err, res, body) => {
      if (err) {
        return callback(err);
      }
      // if (res.statusCode !== 201) {
      //   return callback(new Error(body));
      // }
      if (options.verbose) {
        console.log(res.statusCode);
      }
      callback(null);
    }
  );
};

const uploadManifest = callback => {
  console.log('manifest', JSON.stringify(manifest));
  request(
    {
      method: 'PUT',
      url: `https://registry-1.docker.io/v2/${options.images.target.org}/${options.images.target.image}/manifests/${options.images.target.tag}`,
      auth: {
        bearer
      },
      headers: {
        'content-type': 'application/vnd.docker.distribution.manifest.v2+json'
      },
      body: JSON.stringify(manifest, null, 4)
    },
    (err, res, body) => {
      if (err) {
        return callback(err);
      }
      if (res.statusCode !== 201) {
        return callback(new Error(body));
      }
      if (options.verbose) {
        console.log(res.statusCode);
        //          console.log(res);
      }
      callback(null);
    }
  );
};

async.series(
  [
    getToken,
    getManifest,
    getConfig,
    getPushToken,
    beginUpload,
    uploadConfig,
    checkConfigBlob,
    uploadManifest,

    callback => {
      console.log('Done.');
    }
  ],
  errSeries => {
    if (errSeries) {
      console.log('Error:', errSeries);
    }
  }
);
