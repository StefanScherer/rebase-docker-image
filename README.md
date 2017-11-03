# rebase-docker-image
Rebase a dockerized Windows app to a newer Windows Docker base image.

## Introduction

This repo started just for fun to see if it's possible to swap the
Windows base images of existing apps on the Docker Hub.

## Use cases

- Easily apply Windows Updates to an existing Windows app in seconds.
- Make images usable again that you have built with Insider.
- Provide your app for all available Windows Update layers to avoid download.
- Sync multiple images based on different Windows Update layers to the current.
- Create images for Server 1709 without having a machine for it.
- The tool can also be used on Linux as no images have to be pulled.

## Limits

- You cannot move an app from a windowsservercore image to the nanoserver image.
- You cannot rebase windowsservercore image with `RUN` instructions to 1709. Only `COPY` and `ENV` seem to be fine.
- You also cannot move PowerShell scripts into the 1709 nanoserver image as there is no PowerShell installed.
- Be warned that this tool may create corrupt images.

## Installation

```
npm install -g rebase-docker-image
```

## Usage

```
C:\> rebase-docker-image -h
Usage: rebase-docker-image src -t target -b base
```

It also needs two environment variables `DOCKER_USER` and `DOCKER_PASS` to push the target image.


## Example

Let's modernize or update golang from the 10.0.14393.x base image to the 1709 variant.

```
$ rebase-docker-image \
    golang:1.9-nanoserver \
    -t stefanscherer/golang-windows:1.9-nanoserver-1709 \
    -b microsoft/nanoserver:1709
```

### Run it in a container

#### Windows

```
docker run -it -e DOCKER_USER -e DOCKER_PASS stefanscherer/node-windows:1709 cmd
npm install -g rebase-docker-image
rebase-docker-image -h
```

#### Linux

```
docker run -it -e DOCKER_USER -e DOCKER_PASS node bash
npm install -g rebase-docker-image
rebase-docker-image -h
```

## Contributing

This tool is in an early stage and many things can be improved.

- Add unit tests, as said it was a Proof of Concept
- Support the ~/.docker/config.json auth or the keychain
- Rewrite it to Golang
- ...

## License

MIT
