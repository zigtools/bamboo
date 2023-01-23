import { default as express } from "express";
import { update, createGroupings, getObject, Group } from "./data.js";
import { default as archiver } from "archiver";
import { createGzip, createInflateRaw } from "zlib";

/**
 * @type {Map<string, Group>}
 */
let groups = new Map();
const { repos, entries, entryMap } = await update();

createGroupings(groups, entries);

const app = express();

app.use(express.static("static"));

const utils = {
    sortLastModified(anything) {
        return (Array.isArray(anything) ? anything : [...anything]).sort((a, b) => b.lastModified - a.lastModified);
    },
};

app.get("/", (req, res) => {
    res.render("index.ejs", {
        repos,
        groups,
        ...utils,
    });
});

app.get("/group/:group", (req, res) => {
    const group = groups.get(req.params.group);
    if (!group) return res.status(404).send("404");

    res.render("group.ejs", {
        groups,
        group,
        ...utils,
    });
});

app.get("/repo/:username/:repoName", (req, res) => {
    const repo = repos.get(`${req.params.username}/${req.params.repoName}`);
    if (!repo) return res.status(404).send("404");

    res.render("repo.ejs", {
        repo,
        ...utils,
    });
});

app.get("/repo/:username/:repoName/:branch", (req, res) => {
    const repo = repos.get(`${req.params.username}/${req.params.repoName}`);
    if (!repo) return res.status(404).send("404");

    const branch = repo.branches.get(req.params.branch);
    if (!branch) return res.status(404).send("404");

    res.render("branch.ejs", {
        repo,
        branch,
        ...utils,
    });
});

app.get("/repo/:username/:repoName/:branch/commit/:commit", (req, res) => {
    const repo = repos.get(`${req.params.username}/${req.params.repoName}`);
    if (!repo) return res.status(404).send("404");

    const branch = repo.branches.get(req.params.branch);
    if (!branch) return res.status(404).send("404");
    
    const commit = branch.commits.get(req.params.commit);
    if (!commit) return res.status(404).send("404");

    res.render("commit.ejs", {
        groups,
        repo,
        branch,
        commit,
        ...utils,
    });
});

async function createArchive(kind, entry, res) {
    const commit = entry.commit;
    const branch = commit.branch;
    const repo = branch.repo;

    const baseKey = `${repo.username}/${repo.repoName}/${branch.name}/${commit.sha}/${+entry.lastModified}`;

    const [ info, stderr, stdin, stdout, principal ] = await Promise.all([
        getObject(`${baseKey}/info`),
        getObject(`${baseKey}/stderr.log`),
        getObject(`${baseKey}/stdin.log`),
        getObject(`${baseKey}/stdout.log`),
        getObject(`${baseKey}/principal.zig`),
    ]);

    var archive = archiver(kind, {});

    archive.append(info.Body, {name: "info"});
    archive.append(stderr.Body.pipe(createInflateRaw({windowBits: 15, })), {name: "stderr.log"});
    archive.append(stdin.Body.pipe(createInflateRaw({windowBits: 15})), {name: "stdin.log"});
    archive.append(stdout.Body.pipe(createInflateRaw({windowBits: 15})), {name: "stdout.log", });
    archive.append(principal.Body, {name: "principal.zig"});

    if (kind === "tar") {
        res.contentType("tar.gz");
        archive.pipe(createGzip()).pipe(res);
    } else if (kind === "zip") {
        res.contentType("zip");
        archive.pipe(res);
    }

    await archive.finalize();
}

app.get("/entry/:entry.tar.gz", async (req, res) => {
    const entry = entryMap.get(req.params.entry);
    if (!entry) return res.status(404).send("404");

    await createArchive("tar", entry, res);
});

app.get("/entry/:entry.zip", async (req, res) => {
    const entry = entryMap.get(req.params.entry);
    if (!entry) return res.status(404).send("404");

    await createArchive("zip", entry, res);
});

app.get("/entry/:entry/:file", async (req, res) => {
    const entry = entryMap.get(req.params.entry);
    if (!entry) return res.status(404).send("404");

    const commit = entry.commit;
    const branch = commit.branch;
    const repo = branch.repo;

    const key = `${repo.username}/${repo.repoName}/${branch.name}/${commit.sha}/${+entry.lastModified}/${req.params.file}`;

    try {
        const obj = await getObject(key);

        if (req.params.file !== "principal.zig") {
            res.setHeader("Content-Encoding", "deflate");
        }

        obj.Body.pipe(res);
    } catch {
        res.status(404).send("404");
    }
});

app.listen(1313, "127.0.0.1");

