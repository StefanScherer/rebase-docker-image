#!/usr/bin/env node
'use strict';

const async = require('async');
const request = require('request');
const sha256 = require('sha256');

const username = process.env.DOCKER_USER || 'username';
const password = process.env.DOCKER_PASS || 'password';

const commandLineArgs = require('command-line-args');

const optionDefinitions = [
  { name: 'verbose', alias: 'v', type: Boolean },
  { name: 'src', type: String, defaultOption: true },
  { name: 'srcbase', alias: 's', type: String },
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
  if (!imagename) {
    return;
  }
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
  options.images.srcbase = parseImageArg(options.srcbase);
  options.images.target = parseImageArg(options.target);
  options.images.base = parseImageArg(options.base);

  if (options.verbose) {
    console.log(options);
  }
};

parseArgs();

let bearer;
let manifestSource;
let configSource;
let manifestSourceBase;
let configSourceBase;
let manifestTargetBase;
let configTargetBase;
let manifestTarget;
let configTarget;
let upload;

const getTokenForSourceImage = callback => {
  request(
    `https://auth.docker.io/token?account=${username}&scope=repository%3A${
      options.images.src.org
    }%2F${options.images.src.image}%3Apull&service=registry.docker.io`,
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

const getManifestOfSourceImage = callback => {
  console.log(
    `Retrieving information about source image ${options.images.src.org}/${
      options.images.src.image
    }:${options.images.src.tag}`
  );
  request(
    {
      url: `https://registry-1.docker.io/v2/${options.images.src.org}/${
        options.images.src.image
      }/manifests/${options.images.src.tag}`,
      auth: {
        bearer
      },
      json: true,
      headers: {
        Accept:
          'application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json'
      }
    },
    (err, res, body) => {
      if (err) {
        return callback(err);
      }
      if (
        body.mediaType ===
        'application/vnd.docker.distribution.manifest.list.v2+json'
      ) {
        options.images.src.tag = body.manifests[0].digest;
        getManifestOfSourceImage(() => {
          if (options.verbose) {
            console.log('source manifest:', manifestSource);
          }
          return callback(null);
        });
      } else {
        manifestSource = body;
        if (options.verbose) {
          console.log('source manifest:', manifestSource);
        }
        callback(null);
      }
    }
  );
};

const getConfigOfSourceImage = callback => {
  request(
    {
      url: `https://registry-1.docker.io/v2/${options.images.src.org}/${
        options.images.src.image
      }/blobs/${manifestSource.config.digest}`,
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
        console.log(
          'src image os:',
          body.os,
          'os.version:',
          body['os.version']
        );
        console.log('src image diff_ids:', body.rootfs.diff_ids);
      }
      configSource = body;
      callback(null);
    }
  );
};

const getTokenForTargetBaseImage = callback => {
  request(
    `https://auth.docker.io/token?account=${username}&scope=repository%3A${
      options.images.base.org
    }%2F${options.images.base.image}%3Apull&service=registry.docker.io`,
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

const getManifestOfTargetBaseImage = callback => {
  console.log(
    `Retrieving information about target base image ${
      options.images.base.org
    }/${options.images.base.image}:${options.images.base.tag}`
  );
  request(
    {
      url: `https://registry-1.docker.io/v2/${options.images.base.org}/${
        options.images.base.image
      }/manifests/${options.images.base.tag}`,
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
      manifestTargetBase = body;
      if (options.verbose) {
        console.log('target base image manifest:', manifestTargetBase);
      }
      callback(null);
    }
  );
};

const getConfigOfTargetBaseImage = callback => {
  request(
    {
      url: `https://registry-1.docker.io/v2/${options.images.base.org}/${
        options.images.base.image
      }/blobs/${manifestTargetBase.config.digest}`,
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
        console.log(
          'target base image os:',
          body.os,
          'os.version:',
          body['os.version']
        );
        console.log('target base image diff_ids:', body.rootfs.diff_ids);
      }
      configTargetBase = body;
      callback(null);
    }
  );
};

const matchSourceBaseImage = callback => {
  if (!options.images.srcbase || !options.images.srcbase.org) {
    options.images.srcbase = Object.assign({}, options.images.base);
    options.images.srcbase.tag = configSource['os.version'];
  }
  callback(null);
};

const getTokenForSourceBaseImage = callback => {
  request(
    `https://auth.docker.io/token?account=${username}&scope=repository%3A${
      options.images.srcbase.org
    }%2F${options.images.srcbase.image}%3Apull&service=registry.docker.io`,
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

const getManifestOfSourceBaseImage = callback => {
  console.log(
    `Retrieving information about source base image ${
      options.images.srcbase.org
    }/${options.images.srcbase.image}:${options.images.srcbase.tag}`
  );
  request(
    {
      url: `https://registry-1.docker.io/v2/${options.images.srcbase.org}/${
        options.images.srcbase.image
      }/manifests/${options.images.srcbase.tag}`,
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
      manifestSourceBase = body;
      if (options.verbose) {
        console.log('src base image manifest:', manifestSourceBase);
      }
      callback(null);
    }
  );
};

const getConfigOfSourceBaseImage = callback => {
  request(
    {
      url: `https://registry-1.docker.io/v2/${options.images.srcbase.org}/${
        options.images.srcbase.image
      }/blobs/${manifestSourceBase.config.digest}`,
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
        console.log(
          'src base image os:',
          body.os,
          'os.version:',
          body['os.version']
        );
        console.log('src base image diff_ids:', body.rootfs.diff_ids);
      }
      configSourceBase = body;
      callback(null);
    }
  );
};

const getTokenForTargetImage = callback => {
  request(
    `https://auth.docker.io/token?account=${username}&scope=repository%3A${
      options.images.target.org
    }%2F${options.images.target.image}%3Apush%2Cpull&scope=repository%3A${
      options.images.src.org
    }%2F${options.images.src.image}%3Apull&service=registry.docker.io`,
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
  console.log(
    `Pushing target image ${options.images.target.org}/${
      options.images.target.image
    }:${options.images.target.tag}`
  );
  request(
    {
      method: 'POST',
      url: `https://registry-1.docker.io/v2/${options.images.target.org}/${
        options.images.target.image
      }/blobs/uploads/`,
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

const rebaseBaseImages = callback => {
  console.log('Rebasing image');
  configTarget = configSource;
  manifestTarget = manifestSource;

  if (options.verbose) {
    console.log('current config:', configTarget);
  }

  configTarget['os.version'] = configTargetBase['os.version'];

  if (options.verbose) {
    console.log('old base layers:', manifestSourceBase.layers);
  }
  if (manifestTarget.layers[0].digest !== manifestSourceBase.layers[0].digest) {
    return callback(new Error('Base layer digest mismatch.'));
  }

  if (options.verbose) {
    console.log('current layers:', manifestTarget.layers);
  }

  manifestTarget.layers.splice.apply(
    manifestTarget.layers,
    [0, manifestSourceBase.layers.length].concat(manifestTargetBase.layers)
  );

  if (options.verbose) {
    console.log('rebased layers:', manifestTarget.layers);
    console.log('current diff_ids:', configTarget.rootfs.diff_ids);
  }
  configTarget.rootfs.diff_ids.splice.apply(
    configTarget.rootfs.diff_ids,
    [0, configSourceBase.rootfs.diff_ids.length].concat(
      configTargetBase.rootfs.diff_ids
    )
  );

  configTarget.history.splice.apply(
    configTarget.history,
    [0, configSourceBase.history.length].concat(configTargetBase.history)
  );

  if (options.verbose) {
    console.log('rebased diff_ids:', configTarget.rootfs.diff_ids);
    console.log('rebased config:', configTarget);
  }

  let data = JSON.stringify(configTarget);
  manifestTarget.config.digest = 'sha256:' + sha256(data);
  manifestTarget.config.size = data.length;

  callback(null);
};

const uploadConfigForTargetImage = callback => {
  if (options.verbose) {
    console.log('target image config:', configTarget);
    console.log('target image digest:', manifestTarget.config.digest);
  }
  request(
    {
      method: 'PUT',
      url: `${upload}&digest=${manifestTarget.config.digest}`,
      auth: {
        bearer
      },
      json: true,
      body: configTarget
    },
    (err, res, body) => {
      if (err) {
        return callback(err);
      }
      if (options.verbose) {
        console.log(res.statusCode);
      }
      if (res.statusCode !== 201) {
        return callback(new Error(body));
      }
      callback(null);
    }
  );
};

const checkConfigOfTargetImage = callback => {
  request(
    {
      method: 'HEAD',
      url: `https://registry-1.docker.io/v2/${options.images.target.org}/${
        options.images.target.image
      }/blobs/${manifestTarget.config.digest}`,
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

const mountLayersForTargetImage = callback => {
  if (options.verbose) {
    console.log('target image layers:', JSON.stringify(manifestTarget.layers));
  }

  async.eachSeries(
    manifestTarget.layers,
    (layer, eachCallback) => {
      if (
        layer.mediaType ===
        'application/vnd.docker.image.rootfs.foreign.diff.tar.gzip'
      ) {
        return eachCallback(null);
      }
      request(
        {
          method: 'HEAD',
          url: `https://registry-1.docker.io/v2/${options.images.target.org}/${
            options.images.target.image
          }/blobs/${layer.digest}`,
          auth: {
            bearer
          }
        },
        (err, res, body) => {
          if (err) {
            return eachCallback(err);
          }
          if (res.statusCode !== 200 && res.statusCode !== 404) {
            return eachCallback(new Error(body));
          }
          if (res.statusCode === 404) {
            console.log(
              `Mounting ${layer.digest} from ${options.images.src.org}/${
                options.images.src.image
              }`
            );
            request(
              {
                method: 'POST',
                url: `https://registry-1.docker.io/v2/${
                  options.images.target.org
                }/${options.images.target.image}/blobs/uploads/?from=${
                  options.images.src.org
                }%2F${options.images.src.image}&mount=${layer.digest}`,
                auth: {
                  bearer
                },
                headers: {
                  'Content-Length': 0
                }
              },
              (errPost, resPost, bodyPost) => {
                if (errPost) {
                  return eachCallback(errPost);
                }
                if (resPost.statusCode !== 201) {
                  return eachCallback(new Error(bodyPost));
                }
                return eachCallback(null);
              }
            );
          } else {
            // console.log('huhu');
            eachCallback(null);
          }
        }
      );
    },
    errMount => {
      callback(errMount);
    }
  );
};

const uploadManifestForTargetImage = callback => {
  if (options.verbose) {
    console.log('target image manifest:', JSON.stringify(manifestTarget));
  }
  request(
    {
      method: 'PUT',
      url: `https://registry-1.docker.io/v2/${options.images.target.org}/${
        options.images.target.image
      }/manifests/${options.images.target.tag}`,
      auth: {
        bearer
      },
      headers: {
        'content-type': 'application/vnd.docker.distribution.manifest.v2+json'
      },
      body: JSON.stringify(manifestTarget, null, 4)
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
      }
      callback(null);
    }
  );
};

async.series(
  [
    getTokenForSourceImage,
    getManifestOfSourceImage,
    getConfigOfSourceImage,

    matchSourceBaseImage,
    getTokenForSourceBaseImage,
    getManifestOfSourceBaseImage,
    getConfigOfSourceBaseImage,

    getTokenForTargetBaseImage,
    getManifestOfTargetBaseImage,
    getConfigOfTargetBaseImage,

    getTokenForTargetImage,
    rebaseBaseImages,
    beginUpload,
    uploadConfigForTargetImage,
    checkConfigOfTargetImage,
    mountLayersForTargetImage,
    uploadManifestForTargetImage,

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
