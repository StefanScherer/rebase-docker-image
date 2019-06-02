#!/usr/bin/env node
'use strict';

const async = require('async');
const commandLineArgs = require('command-line-args');
const getUsage = require('command-line-usage');
const request = require('request');
const sha256 = require('sha256');

const parseImage = require('./lib/parseImage');

const username = process.env.DOCKER_USER || 'username';
const password = process.env.DOCKER_PASS || 'password';

const optionDefinitions = [
  {
    name: 'verbose',
    alias: 'v',
    type: Boolean,
    description: 'Show more output.'
  },
  {
    name: 'src',
    type: String,
    defaultOption: true,
    description: 'Source image for the rebase.'
  },
  {
    name: 'srcbase',
    alias: 's',
    type: String,
    description:
      'If name target base image differs from source image, you can specify the source base image.'
  },
  {
    name: 'target',
    alias: 't',
    type: String,
    description: 'The target image name and tag after the rebase.'
  },
  {
    name: 'targetbase',
    alias: 'b',
    type: String,
    description: 'The target base image that replaces the source base image.'
  },
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Print this usage guide.'
  },
  {
    name: 'version',
    type: Boolean,
    description: 'Print the version of this tool.'
  }
];

const options = commandLineArgs(optionDefinitions);

const showUsage = () => {
  const sections = [
    {
      header: 'rebase-docker-image',
      content:
        'Rebase a dockerized Windows app to a newer Windows Docker base image. The rebase happens directly in Docker Hub, so no images have to be pulled and you can run this tool on a non-Windows platform. You have to set the environment variables DOCKER_USER and DOCKER_PASS to push the target manifest to Docker Hub.'
    },
    {
      header: 'Synopsis',
      content: [
        '$ rebase-docker-image [{bold --src}] {underline golang:nanoserver-sac2016} {bold --target} {underline my/golang:nanoserver-1709} {bold --targetbase} {underline microsoft/nanoserver:1709}'
      ]
    },
    {
      header: 'Options',
      optionList: optionDefinitions
    }
  ];
  console.log(getUsage(sections));
  process.exit(0);
};

const showVersion = () => {
  console.log(require('./package.json').version);
  process.exit(0);
};

const parseArgs = () => {
  if (options.help) {
    showUsage();
  }
  if (options.version) {
    showVersion();
  }

  if (!options.src) {
    console.log('Error: src image missing.');
    process.exit(1);
  }

  if (!options.target) {
    console.log('Error: target image missing.');
    process.exit(1);
  }

  if (!options.targetbase) {
    console.log('Error: target base image missing.');
    process.exit(1);
  }

  options.images = {};
  options.images.src = parseImage(options.src);
  options.images.srcbase = parseImage(options.srcbase);
  options.images.target = parseImage(options.target);
  options.images.targetbase = parseImage(options.targetbase);

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
  if (options.images.src.registry !== 'registry-1.docker.io') {
    bearer = '';
    return callback(null);
  }

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
      url: `https://${options.images.src.registry}/v2/${options.images.src.imagepath}/manifests/${options.images.src.tag}`,
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
        return callback(null);
      }
    }
  );
};

const getConfigOfSourceImage = callback => {
  request(
    {
      url: `https://${options.images.src.registry}/v2/${options.images.src.imagepath}/blobs/${manifestSource.config.digest}`,
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
  if (options.images.targetbase.registry !== 'registry-1.docker.io') {
    bearer = '';
    return callback(null);
  }

  request(
    `https://auth.docker.io/token?account=${username}&scope=repository%3A${
      options.images.targetbase.org
    }%2F${options.images.targetbase.image}%3Apull&service=registry.docker.io`,
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
      options.images.targetbase.org
    }/${options.images.targetbase.image}:${options.images.targetbase.tag}`
  );
  request(
    {
      url: `https://${options.images.targetbase.registry}/v2/${options.images.targetbase.imagepath}/manifests/${options.images.targetbase.tag}`,
      auth: {
        bearer
      },
      json: true,
      headers: {
        Accept: 'application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json'
      }
    },
    (err, res, body) => {
      if (err) {
        return callback(err);
      }
      if (body.manifests) {
        request(
          {
            url: `https://${options.images.targetbase.registry}/v2/${options.images.targetbase.imagepath}/manifests/${body.manifests[0].digest}`,
            auth: {
              bearer
            },
            json: true,
            headers: {
              Accept: 'application/vnd.docker.distribution.manifest.v2+json'
            }
          },
          (err2, res2, body2) => {
            if (err2) {
              return callback(err2);
            }

          manifestTargetBase = body2;
          if (options.verbose) {
            console.log('target base image manifest:', manifestTargetBase);
          }
          return callback(null);
        });
      } else {
        manifestTargetBase = body;
        if (options.verbose) {
          console.log('target base image manifest:', manifestTargetBase);
        }
        return callback(null);
      }
    }
  );
};

const getConfigOfTargetBaseImage = callback => {
  request(
    {
      url: `https://${options.images.targetbase.registry}/v2/${options.images.targetbase.imagepath}/blobs/${manifestTargetBase.config.digest}`,
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
  if (!options.images.srcbase || !(options.images.srcbase.org || options.images.srcbase.registry)) {
    options.images.srcbase = Object.assign({}, options.images.targetbase);
    // best guess is to use the os.version as tag name, otherwise use -s to specify exact source base image
    options.images.srcbase.tag = configSource['os.version'];
  }
  callback(null);
};

const getTokenForSourceBaseImage = callback => {
  if (options.images.srcbase.registry !== 'registry-1.docker.io') {
    bearer = '';
    return callback(null);
  }

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
      options.images.srcbase.registry
    }/${options.images.srcbase.imagepath}:${options.images.srcbase.tag}`
  );
  request(
    {
      url: `https://${options.images.srcbase.registry}/v2/${options.images.srcbase.imagepath}/manifests/${options.images.srcbase.tag}`,
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
      if (res.statusCode >= 400) {
        return callback(new Error(body.errors[0].code));
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
      url: `https://${options.images.srcbase.registry}/v2/${options.images.srcbase.imagepath}/blobs/${manifestSourceBase.config.digest}`,
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
  if (options.images.target.registry !== 'registry-1.docker.io') {
    bearer = '';
    return callback(null);
  }

  if (!options.images.targetbase.org && options.images.targetbase.imagepath === 'windows/nanoserver') {
    options.images.targetbase.org = 'stefanscherer';
    options.images.targetbase.image = 'nanoserver';
  }
  request(
    `https://auth.docker.io/token?account=${username}&scope=repository%3A${
      options.images.target.org
    }%2F${options.images.target.image}%3Apush%2Cpull&scope=repository%3A${
      options.images.src.org
    }%2F${options.images.src.image}%3Apull&scope=repository%3A${
      options.images.targetbase.org
    }%2F${options.images.targetbase.image}%3Apull&service=registry.docker.io`,
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
      url: `https://${options.images.target.registry}/v2/${options.images.target.imagepath}/blobs/uploads/`,
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
      url: `https://${options.images.target.registry}/v2/${options.images.target.imagepath}/blobs/${manifestTarget.config.digest}`,
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
          url: `https://${options.images.target.registry}/v2/${options.images.target.imagepath}/blobs/${layer.digest}`,
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
                url: `https://${options.images.target.registry}/v2/${options.images.target.imagepath}/blobs/uploads/?from=${options.images.src.org}%2F${options.images.src.image}&mount=${layer.digest}`,
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
                  console.log(
                    `Mounting ${layer.digest} from ${
                      options.images.targetbase.org
                    }/${options.images.targetbase.image}`
                  );
                  return request(
                    {
                      method: 'POST',
                      url: `https://${options.images.target.registry}/v2/${options.images.target.imagepath}/blobs/uploads/?from=${options.images.targetbase.org}%2F${options.images.targetbase.image}&mount=${layer.digest}`,
                      auth: {
                        bearer
                      },
                      headers: {
                        'Content-Length': 0
                      }
                    },
                    (errBasePost, resBasePost, bodyBasePost) => {
                      if (errBasePost) {
                        return eachCallback(errBasePost);
                      }
                      if (resBasePost.statusCode !== 201) {
                        return eachCallback(new Error(bodyBasePost));
                      }
                      return eachCallback(null);
                    }
                  );
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
      url: `https://${options.images.target.registry}/v2/${options.images.target.imagepath}/manifests/${options.images.target.tag}`,
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
