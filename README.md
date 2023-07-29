# bamboo (fuzzing.zigtools.org)

Server that processes and serves fuzzing data collected with [sus](https://github.com/zigtools/sus) and uploaded via the [`fuzz` action](https://github.com/zigtools/zls/blob/master/.github/workflows/fuzz.yml).

## Running

`docker compose --env-file=.env up [-d]`
