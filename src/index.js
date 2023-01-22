import { default as express } from "express";
import { update, createGroupings, getObject } from "./data.js";

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
        entryCount: entries.length,
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

