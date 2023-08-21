import { createHash, randomBytes } from 'crypto'
import { createGzip, createInflateRaw } from 'zlib'

import { S3 } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'
import archiver from 'archiver'
import axios from 'axios'
import dotenv from 'dotenv'
import express from 'express'
import expressFileUpload from 'express-fileupload'
import expressSession from 'express-session'

dotenv.config()

const app = express()

declare module 'express-session' {
    interface SessionData {
        csrf?: string
        username: string
        isZigtoolsMember?: boolean
    }
}

const utils = {
    newGithubIssueUrl(options: any = {}) {
        let repoUrl
        if (options.repoUrl) {
            repoUrl = options.repoUrl
        } else if (options.user && options.repo) {
            repoUrl = `https://github.com/${options.user}/${options.repo}`
        } else {
            throw new Error('You need to specify either the `repoUrl` option or both the `user` and `repo` options')
        }

        const url = new URL(`${repoUrl}/issues/new`)

        const types = ['body', 'title', 'labels', 'template', 'milestone', 'assignee', 'projects']

        for (const type of types) {
            let value = options[type]
            if (value === undefined) {
                continue
            }

            if (type === 'labels' || type === 'projects') {
                if (!Array.isArray(value)) {
                    throw new TypeError(`The \`${type}\` option should be an array`)
                }

                value = value.join(',')
            }

            url.searchParams.set(type, value)
        }

        return url.toString()
    },
    site: process.env.SITE,
}

app.use(express.static('static'))
app.use(expressFileUpload())
app.use(
    expressSession({
        secret: randomBytes(64).toString('hex'),
        resave: false,
        saveUninitialized: false,
    })
)

app.use(function (req, res, next) {
    if (process.env.SITE === 'http://127.0.0.1:1313') {
        let session = req.session
        if (req.query.localGuest !== undefined) {
            session.username = 'localuser'
            session.isZigtoolsMember = false
            session.csrf = randomBytes(64).toString('hex')
        } else if (req.query.localMember !== undefined) {
            session.username = 'localuser'
            session.isZigtoolsMember = true
            session.csrf = randomBytes(64).toString('hex')
        }
    }

    res.locals.session = req.session
    next()
})

const prisma = new PrismaClient()

const bucketClient = new S3({
    forcePathStyle: false,
    endpoint: process.env.BUCKET_ENDPOINT,
    region: process.env.BUCKET_REGION,
    credentials: {
        accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
        secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
    },
})

function hash(data: string | NodeJS.ArrayBufferView) {
    return createHash('sha256').update(data).digest('hex')
}

function simplifyPath(where: string) {
    const zlsLoc = '/home/runner/work'
    const zigLoc = '/opt/hostedtoolcache/zig'
    if (where.startsWith(zlsLoc)) return where.slice(where.lastIndexOf('zls/'))
    if (where.startsWith(zigLoc)) return `zig/${where.slice(where.indexOf('x64/') + 4)}`
    return where
}

/**
 * Upload a fuzzing result to database/bucket
 */
app.post('/ingest', async (req, res) => {
    if (req.files) {
        const files: expressFileUpload.UploadedFile[] = (
            Array.isArray(req.files) ? req.files.entries : [req.files.entries]
        ) as any
        for (const file of files) {
            let index = 0

            const createdAt = new Date(Number(file.data.readBigInt64LE(index)))
            index += 8

            const zigVersionLength = file.data.readInt8(index)
            index += 1

            const zigVersion = new TextDecoder().decode(file.data.subarray(index, index + zigVersionLength))
            index += zigVersionLength

            const zlsVersionLength = file.data.readInt8(index)
            index += 1

            const zlsVersion = new TextDecoder().decode(file.data.subarray(index, index + zlsVersionLength))
            index += zlsVersionLength

            for (let i = 0; i < 3; i++) index += file.data.readInt32LE(index) + 4

            let stderrLength = file.data.readInt32LE(index)
            index += 4

            const panicRegex = /panic:.*?\n(.*.zig):(\d*):(\d*).*?\n(.*)/
            const stderr = new TextDecoder().decode(file.data.subarray(index, index + stderrLength))

            let summary: string
            const crashLocation = stderr.match(panicRegex)

            if (crashLocation) {
                summary = `In ${simplifyPath(crashLocation[1])}:${crashLocation[2]}:${
                    crashLocation[3]
                }; \`${crashLocation[4].trim()}\``
            } else {
                summary = 'No summary available'
                return
            }

            const repoId = hash(`${req.body.owner}/${req.body.repo}`)
            await prisma.repo.upsert({
                create: {
                    id: repoId,
                    owner: req.body.owner,
                    repo: req.body.repo,
                },
                update: {},
                where: {
                    id: repoId,
                },
            })

            const branchId = hash(`${req.body.owner}/${req.body.repo}/${req.body.branch}`)
            await prisma.branch.upsert({
                create: {
                    id: branchId,
                    name: req.body.branch,
                    repoId,
                },
                update: {},
                where: {
                    id: branchId,
                },
            })

            const commitId = hash(`${req.body.owner}/${req.body.repo}/${req.body.branch}/${req.body.commit}`)
            await prisma.commit.upsert({
                create: {
                    id: commitId,
                    hash: req.body.commit,
                    branchId,
                },
                update: {},
                where: {
                    id: commitId,
                },
            })

            const groupId = hash(summary)
            await prisma.group.upsert({
                create: {
                    id: groupId,
                    summary,
                },
                update: {},
                where: {
                    id: groupId,
                },
            })

            const entry = await prisma.entry.create({
                data: {
                    id: hash(file.data),
                    createdAt,

                    zigVersion,
                    zlsVersion,

                    commitId,

                    groupId,
                },
            })

            await bucketClient.putObject({
                Bucket: process.env.BUCKET,
                Key: entry.id,
                Body: file.data,
                Metadata: {
                    'x-owner': req.body.owner,
                    'x-repo': req.body.repo,
                    'x-branch': req.body.branch,
                    'x-commit': req.body.commit,
                },
                ACL: 'public-read',
            })
        }
    }

    res.status(200).send()
})

app.get('/', async (req, res) => {
    const repos = await prisma.repo.findMany({
        select: {
            id: true,
            owner: true,
            repo: true,
            branches: {
                select: {
                    commits: {
                        select: {
                            entries: {
                                select: {
                                    createdAt: true,
                                },
                                orderBy: {
                                    createdAt: 'desc',
                                },
                                take: 1,
                            },
                            _count: {
                                select: {
                                    entries: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    })

    const groups = await prisma.group.findMany({
        select: {
            id: true,
            summary: true,
            entries: {
                select: {
                    createdAt: true,
                },
                orderBy: {
                    createdAt: 'desc',
                },
                take: 1,
            },
            _count: {
                select: {
                    entries: true,
                },
            },
        },
    })

    res.render('index.ejs', {
        repos,
        groups,

        ...utils,
    })
})

app.get('/group/:id', async (req, res) => {
    const group = await prisma.group.findUnique({
        where: {
            id: req.params.id,
        },
        include: {
            entries: {
                include: {
                    group: {
                        select: {
                            id: true,
                            summary: true,
                        },
                    },
                    commit: {
                        include: {
                            branch: {
                                include: {
                                    commits: true,
                                    repo: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    })
    if (!group) return res.status(404).send('404')

    res.render('group.ejs', {
        group,
        ...utils,
    })
})

app.get('/repo/:id', (req, res) => {
    const repo = prisma.repo.findUnique({
        where: {
            id: req.params.id,
        },
    })
    if (!repo) return res.status(404).send('404')

    res.render('repo.ejs', {
        repo,
        ...utils,
    })
})

// app.get("/repo/:username/:repoName/:branch", (req, res) => {
//     const repo = repos.get(`${req.params.username}/${req.params.repoName}`);
//     if (!repo) return res.status(404).send("404");

//     const branch = repo.branches.get(req.params.branch);
//     if (!branch) return res.status(404).send("404");

//     res.render("branch.ejs", {
//         repo,
//         branch,

//         ...utils,
//     });
// });

// app.get("/repo/:username/:repoName/:branch/commit/:commit", (req, res) => {
//     const repo = repos.get(`${req.params.username}/${req.params.repoName}`);
//     if (!repo) return res.status(404).send("404");

//     const branch = repo.branches.get(req.params.branch);
//     if (!branch) return res.status(404).send("404");

//     const commit = branch.commits.get(req.params.commit);
//     if (!commit) return res.status(404).send("404");

//     res.render("commit.ejs", {
//         groups,
//         repo,
//         branch,
//         commit,

//         ...utils,
//     });
// });

// async function createArchive(kind, entry, res) {
//     const commit = entry.commit;
//     const branch = commit.branch;
//     const repo = branch.repo;

//     const baseKey = `${repo.username}/${repo.repoName}/${branch.name}/${commit.sha}/${+entry.lastModified}`;

//     const [ info, stderr, stdin, stdout, principal ] = await Promise.all([
//         getObject(`${baseKey}/info`),
//         getObject(`${baseKey}/stderr.log`),
//         getObject(`${baseKey}/stdin.log`),
//         getObject(`${baseKey}/stdout.log`),
//         getObject(`${baseKey}/principal.zig`),
//     ]);

//     var archive = archiver(kind, {});

//     archive.append(info.Body, {name: "info"});
//     archive.append(stderr.Body.pipe(createInflateRaw({windowBits: 15, })), {name: "stderr.log"});
//     archive.append(stdin.Body.pipe(createInflateRaw({windowBits: 15})), {name: "stdin.log"});
//     archive.append(stdout.Body.pipe(createInflateRaw({windowBits: 15})), {name: "stdout.log", });
//     archive.append(principal.Body, {name: "principal.zig"});

//     if (kind === "tar") {
//         res.contentType("tar.gz");
//         archive.pipe(createGzip()).pipe(res);
//     } else if (kind === "zip") {
//         res.contentType("zip");
//         archive.pipe(res);
//     }

//     await archive.finalize();
// }

// app.get("/entry/:entry.tar.gz", async (req, res) => {
//     const entry = entryMap.get(req.params.entry);
//     if (!entry) return res.status(404).send("404");

//     await createArchive("tar", entry, res);
// });

// app.get("/entry/:entry.zip", async (req, res) => {
//     const entry = entryMap.get(req.params.entry);
//     if (!entry) return res.status(404).send("404");

//     await createArchive("zip", entry, res);
// });

// app.get("/entry/:entry/:file", async (req, res) => {
//     const entry = entryMap.get(req.params.entry);
//     if (!entry) return res.status(404).send("404");

//     const commit = entry.commit;
//     const branch = commit.branch;
//     const repo = branch.repo;

//     const key = `${repo.username}/${repo.repoName}/${branch.name}/${commit.sha}/${+entry.lastModified}/${req.params.file}`;

//     res.setHeader("Content-Type", "text/plain");

//     try {
//         const obj = await getObject(key);

//         if (req.params.file !== "principal.zig") {
//             res.setHeader("Content-Encoding", "deflate");
//         }

//         obj.Body.pipe(res);
//     } catch {
//         res.status(404).send("404");
//     }
// });

// // Authenticated actions

let states: Map<string, string> = new Map()
app.get('/login', (req, res) => {
    const state = randomBytes(64).toString('hex')
    states.set(state, (req.headers.referer || process.env.SITE)!)
    res.redirect(
        `https://github.com/login/oauth/authorize?client_id=${process.env.GH_CLIENT_ID}&scope=read:org&state=${state}`
    )
})

app.get('/oauth', async (req, res) => {
    const code = req.query.code as string
    const state = req.query.state as string

    const redir = states.get(state)

    if (!redir) {
        return res.status(403).send('Invalid state')
    }

    states.delete(state)

    const { access_token: accessToken } = (
        await axios.post(
            'https://github.com/login/oauth/access_token',
            {
                client_id: process.env.GH_CLIENT_ID,
                client_secret: process.env.GH_CLIENT_SECRET,
                code,
            },
            {
                headers: {
                    Accept: 'application/json',
                },
            }
        )
    ).data

    const { login } = (
        await axios.get('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        })
    ).data

    const orgs = (
        await axios.get('https://api.github.com/user/orgs', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        })
    ).data

    let session = req.session
    session.username = login
    session.isZigtoolsMember = !!orgs.find((_: any) => _.login === 'zigtools')
    session.csrf = randomBytes(64).toString('hex')

    // Bypass http redirect sometimes blocking cookies
    res.status(200)
        .contentType('html')
        .send(
            `<!DOCTYPE html>
        <html>
        <head><meta http-equiv="refresh" content="0; url='${redir}'"></head>
        <body></body>
        </html>
        `
        )
})

app.get('/logout', async (req, res) => {
    req.session.destroy(() => {
        res.redirect((req.headers.referer || process.env.SITE)!)
    })
})

app.use(function (req, res, next) {
    if (!req.session.isZigtoolsMember) {
        return res.status(403).send('Not a zigtools member!')
    }
    next()
})

app.get('/ingest', (req, res) => {
    res.render('ingest.ejs')
})

app.use(function (req, res, next) {
    if (req.query.csrf !== req.session.csrf) {
        return res.status(403).send('Invalid CSRF token!')
    }
    next()
})

// /**
//  * @param {Entry} entry
//  */
// function deleteEntryLocal(entry) {
//     const commit = entry.commit;

//     if (!entryMap.delete("" + (+entry.lastModified))) console.error("Could not delete entry (map)");
//     const i1 = entries.indexOf(entry);
//     if (i1 !== -1) {
//         entries.splice(i1, 1);
//     } else console.error("Could not delete entry (list)");

//     const i2 = commit.entries.indexOf(entry);
//     if (i2 !== -1) {
//         commit.entries.splice(i2, 1);
//     } else console.error("Could not delete entry (commit list)");

//     const group = groups.get(entry.group);
//     const i3 = group.entries.indexOf(entry);
//     if (i3 !== -1) {
//         group.entries.splice(i3, 1);
//     } else console.error("Could not delete entry (group list)");
// }

// function genBaseKey(entry) {
//     const commit = entry.commit;
//     const branch = commit.branch;
//     const repo = branch.repo;

//     return `${repo.username}/${repo.repoName}/${branch.name}/${commit.sha}/${+entry.lastModified}`;
// }

// /**
//  * @param {Entry} entry
//  */
// async function deleteEntry(entry) {
//     deleteEntryLocal(entry);
//     await deleteEntryRemote(genBaseKey(entry));
// }

// /**
//  * @param {Group} group
//  */
// async function deleteGroup(group) {
//     await deleteEntriesRemote(group.entries.map(genBaseKey));
//     while (group.entries.length !== 0) {
//         deleteEntryLocal(group.entries[0]);
//     }
//     groups.delete(group.hash);
// }

// app.post("/entry/:entry/delete", async (req, res) => {
//     const entry = entryMap.get(req.params.entry);
//     if (!entry) return res.status(404).send("404");

//     await deleteEntry(entry);

//     res.status(200).end();
// });

// app.post("/group/:group/delete", async (req, res) => {
//     const group = groups.get(req.params.group);
//     if (!group) return res.status(404).send("404");

//     await deleteGroup(group);

//     res.status(200).end();
// });

app.listen(1313, () => {
    console.log('Live at http://localhost:1313')
})
