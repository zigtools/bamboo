import express from "express";
import archiver from "archiver";
import { createGzip, createInflateRaw } from "zlib";
import { randomBytes } from "crypto";
import axios from "axios";
import session from "express-session";
import newGithubIssueUrl from "new-github-issue-url";
import postgres from "postgres"
import { S3 } from "@aws-sdk/client-s3";
import dotenv from "dotenv"

dotenv.config()

const app = express();

app.use(express.static("static"));
app.use(session({
    secret: randomBytes(64).toString("hex"),
    resave: false,
    saveUninitialized: false,
}));  

// const utils = {
//     sortLastModified(anything) {
//         return (Array.isArray(anything) ? anything : [...anything]).sort((a, b) => b.lastModified - a.lastModified);
//     },
//     newGithubIssueUrl,
//     site: process.env.SITE,
// };

// app.use(function (req, res, next) {
//     if (process.env.SITE === "http://127.0.0.1:1313") {
//         if (req.query.localGuest !== undefined) {
//             req.session.username = "localuser";
//             req.session.isZigtoolsMember = false;
//             req.session.csrf = randomBytes(64).toString("hex");
//         } else if (req.query.localMember !== undefined) {
//             req.session.username = "localuser";
//             req.session.isZigtoolsMember = true;
//             req.session.csrf = randomBytes(64).toString("hex");
//         }
//     }

//     res.locals.session = req.session;
//     next();
// });  

const sql = postgres({
    host: 'localhost',
    port: 5432,
    database: 'bamboo',
    username: 'zigtools',
});

const bucketClient = new S3({
    forcePathStyle: false,
    endpoint: "https://nyc3.digitaloceanspaces.com",
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    }
});

(async () => {
console.log(await sql`SELECT * FROM information_schema.tables`)
})()

// app.get("/", (req, res) => {
//     res.render("index.ejs", {
//         repos,
//         groups,

//         ...utils,
//     });
// });

// /**
//  * Upload a fuzzing result to database/bucket
//  */
// app.post("/upload")

// app.get("/group/:group", (req, res) => {
//     const group = groups.get(req.params.group);
//     if (!group) return res.status(404).send("404");

//     res.render("group.ejs", {
//         groups,
//         group,

//         ...utils,
//     });
// });

// app.get("/repo/:username/:repoName", (req, res) => {
//     const repo = repos.get(`${req.params.username}/${req.params.repoName}`);
//     if (!repo) return res.status(404).send("404");

//     res.render("repo.ejs", {
//         repo,

//         ...utils,
//     });
// });

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

// /**
//  * Map from state to referer
//  * @type {Map<string, string>}
//  */
// let states = new Map();

// app.get("/login", (req, res) => {
//     const state = randomBytes(64).toString("hex");
//     states.set(state, req.headers.referer || process.env.SITE);
//     // ${process.env.DOMAIN ? "" : "&redirect_uri=http://127.0.0.1:1313/oauth"}
//     res.redirect(`https://github.com/login/oauth/authorize?client_id=${process.env.GH_CLIENT_ID}&scope=read:org&state=${state}`);
// });

// app.get("/oauth", async (req, res) => {
//     const { code, state } = req.query;

//     const redir = states.get(state);

//     if (!redir) {
//         return res.status(403).send("Invalid state");
//     }

//     states.delete(state);

//     const { access_token: accessToken } = (await axios.post("https://github.com/login/oauth/access_token", {
//         client_id: process.env.GH_CLIENT_ID,
//         client_secret: process.env.GH_CLIENT_SECRET,
//         code,
//     }, {
//         headers: {
//             Accept: "application/json"
//         }
//     })).data;

//     const { login } = (await axios.get("https://api.github.com/user", {
//         headers: {
//             Authorization: `Bearer ${accessToken}`
//         }
//     })).data;

//     const orgs = (await axios.get("https://api.github.com/user/orgs", {
//         headers: {
//             Authorization: `Bearer ${accessToken}`
//         }
//     })).data;

//     req.session.username = login;
//     req.session.isZigtoolsMember = !!orgs.find(_ => _.login === "zigtools");
//     req.session.csrf = randomBytes(64).toString("hex");
    
//     // Bypass http redirect sometimes blocking cookies
//     res.status(200).contentType("html").send(
//         `<!DOCTYPE html>
//         <html>
//         <head><meta http-equiv="refresh" content="0; url='${redir}'"></head>
//         <body></body>
//         </html>
//         `
//     );
// });

// app.get("/logout", async (req, res) => {
//     req.session.destroy(() => {
//         res.redirect(req.headers.referer || process.env.SITE);
//     });
// });

// // CSRF token and ability check beyond this point
// app.use(function (req, res, next) {
//     if (req.query.csrf !== req.session.csrf) {
//         return res.status(403).send("Invalid CSRF token!");
//     }

//     if (!req.session.isZigtoolsMember) {
//         return res.status(403).send("Not a zigtools member!");
//     }

//     next();
// });  

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

// app.listen(1313, "127.0.0.1", () => {
//     console.log(`Live at ${process.env.SITE}!`);
// });
