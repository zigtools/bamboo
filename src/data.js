import { default as dotenv } from "dotenv";
dotenv.config();
import { S3, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { Inflate } from "fflate";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import { basename } from "path";

function hash(data) {
    return createHash("md5").update(data).digest("hex");
}

const client = new S3({
    forcePathStyle: false,
    endpoint: "https://nyc3.digitaloceanspaces.com",
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

export class Repository {
    /**
     * @type {string}
     */
    username;
    /**
     * @type {string}
     */
    repoName;
    /**
     * @type {Map<string, Branch>}
     */
    branches;
    /**
     * @type {Date}
     */
    lastModified;

    constructor(username, repoName) {
        this.username = username;
        this.repoName = repoName;
        this.branches = new Map();
        this.lastModified = new Date(0);
    }

    updateLastModified(maybeLast) {
        if (maybeLast > this.lastModified) this.lastModified = maybeLast;
    }
}

export class Branch {
    /**
     * @type {Repository}
     */
    repo;

    /**
     * @type {string}
     */
    name;
    /**
     * @type {Map<string, Commit>}
     */
    commits;
    /**
     * @type {Date}
     */
    lastModified;

    constructor(repo, name) {
        this.repo = repo;
        this.name = name;
        this.commits = new Map();
        this.lastModified = new Date(0);
    }

    updateLastModified(maybeLast) {
        if (maybeLast > this.lastModified) this.lastModified = maybeLast;
    }
}

export class Commit {
    /**
     * @type {Branch}
     */
    branch;

    /**
     * @type {string}
     */
    sha;
    /**
     * @type {Entry[]}
     */
    entries;
    /**
     * @type {Date}
     */
    lastModified;

    constructor(branch, sha) {
        this.branch = branch;
        this.sha = sha;
        this.entries = [];
        this.lastModified = new Date(0);
    }

    updateLastModified(maybeLast) {
        if (maybeLast > this.lastModified) this.lastModified = maybeLast;
    }
}

export class Entry {
    /**
     * @type {Commit}
     */
    commit;

    /**
     * MD5 hash that indicates how this entry is grouped
     * @type {string}
     */
    group;
    /**
     * @type {string}
     */
    zlsVersion;
    /**
     * @type {string}
     */
    zigVersion;
    /**
     * @type {Date}
     */
    lastModified;

    constructor(commit, lastModified) {
        this.commit = commit;
        this.lastModified = lastModified;
    }
}

export class Group {
    /**
     * @type {string}
     */
    hash;
    /**
     * @type {string}
     */
    summary;
    /**
     * @type {Entry[]}
     */
    entries;
    /**
     * @type {Date}
     */
    lastModified;

    constructor(hash, summary) {
        this.hash = hash;
        this.summary = summary;
        this.entries = [];
        this.lastModified = new Date(0);
    }

    updateLastModified(maybeLast) {
        if (maybeLast > this.lastModified) this.lastModified = maybeLast;
    }
}

export async function update() {
    let continuationToken = undefined;

    let logcache;

    try {
        logcache = (await fs.readFile(".logcache")).toString();
    } catch {
        logcache = "";
    }

    let logcacheMap = new Map();

    for (const line of logcache.split("\n")) {
        if (!line) break;
        logcacheMap.set(line.split(" ")[0], {
            group: line.split(" ")[1],
            zigVersion: line.split(" ")[2],
            zlsVersion: line.split(" ")[3]
        });
    }

    /**
     * @type {Entry[]}
     */
    let entries = [];
    /**
     * @type {Map<string, Entry>}
     */
    let entryMap = new Map();
    /**
     * @type {Map<string, Repository>}
     */
    let repositories = new Map();

    while (true) {
        const out = await client.send(new ListObjectsV2Command({
            Bucket: "fuzzing-output",
            Key: "",
            ContinuationToken: continuationToken,
        }));

        if (!out.Contents) break;

        const raw = out.Contents.filter(_ => _.Key.endsWith("info")).map(_ => ({
            key: _.Key.slice(0, -5),
            lastModified: _.LastModified,
        }));
        for (const r of raw) {
            const split = r.key.split("/");
            const date = new Date(+split[4]);
            
            const repo = `${split[0]}/${split[1]}`;
            if (!repositories.has(repo)) repositories.set(repo, new Repository(split[0], split[1]));
            
            const repo_obj = repositories.get(repo);
            repo_obj.updateLastModified(date);
            
            if (!repo_obj.branches.has(split[2])) repo_obj.branches.set(split[2], new Branch(repo_obj, split[2]));
            
            const branch_obj = repo_obj.branches.get(split[2]);
            branch_obj.updateLastModified(date);

            if (!branch_obj.commits.has(split[3])) branch_obj.commits.set(split[3], new Commit(branch_obj, split[3]));

            const commit_obj = branch_obj.commits.get(split[3]);
            commit_obj.updateLastModified(date);

            const entry = new Entry(commit_obj,date );
            
            const hcm = logcacheMap.get(r.key);
            if (hcm) {
                entry.group = hcm.group;
                entry.zigVersion = hcm.zigVersion;
                entry.zlsVersion = hcm.zlsVersion;
            }

            commit_obj.entries.push(entry);
            entries.push(entry);
            entryMap.set(split[4], entry);
        }

        if (!out.ContinuationToken) break;
        continuationToken = out.ContinuationToken;
    }

    return { entries, entryMap, repos: repositories };
}

const streamToString = (stream) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

function simplifyPath(where) {
    const zlsLoc = "/home/runner/work";
    const zigLoc = "/opt/hostedtoolcache/zig";
    if (where.startsWith(zlsLoc)) return where.slice(where.lastIndexOf("zls/"));
    if (where.startsWith(zigLoc)) return `zig/${where.slice(where.indexOf("x64/") + 4)}`;
}

/**
 * 
 * @param {Map<string, Group>} groups
 * @param {Entry} entry 
 */
export function grabData(groups, entry) {
    if (entry.group) {
        console.log("Entry already grouped (either previously or cached)");
        if (groups.has(entry.group)) return;
        console.log("Fetching entry regardless to obtain summary...");
    }

    return new Promise(async resolve => {
        const commit = entry.commit;
        const branch = commit.branch;
        const repo = branch.repo;
        const key = `${repo.username}/${repo.repoName}/${branch.name}/${commit.sha}/${+entry.lastModified}`;

        const [ info, stderr ] = await Promise.all([
            client.send(new GetObjectCommand({
                Bucket: "fuzzing-output",
                Key: `${key}/info`,
            })),
            client.send(new GetObjectCommand({
                Bucket: "fuzzing-output",
                Key: `${key}/stderr.log`,
            }))
        ]);

        const infos = (await streamToString(info.Body)).split("\n");
        entry.zigVersion = infos[0].split(": ")[1];
        entry.zlsVersion = infos[1].split(": ")[1];
        
        const decoder = new TextDecoder();
        const inflater = new Inflate();
        stderr.Body.on("data", data => {
            inflater.push(data);
        });

        let panic = "";
        let panicking = false;
        inflater.ondata = data => {
            const string = decoder.decode(data);

            if (panicking) panic += string;

            let ii = string.indexOf("panic:");
            if (ii !== -1) {
                panicking = true;
                panic += string.slice(ii);
            }
        }

        stderr.Body.on("end", async () => {
            const crashLocationRegex = /(.*.zig):(\d*):(\d*)/;

            const lines = panic.trim().split("\n");
            let summary;

            if (lines.length <= 2) summary = "No summary available";
            else {
                const cl = lines[1].match(crashLocationRegex);

                if (cl) {
                    summary = `In ${simplifyPath(cl[1])}:${cl[2]}:${cl[3]}; \`${lines[2].trim()}\``;
                } else {
                    summary = "No summary available"
                    return;
                }
            }

            if (!entry.group) await fs.appendFile(".logcache", `${key} ${hash(summary)} ${entry.zigVersion} ${entry.zlsVersion}\n`);
            entry.group = hash(summary);
            if (!groups.has(entry.group)) groups.set(entry.group, new Group(entry.group, summary));
            resolve();
        });
    });
}

/**
 * @param {Map<string, Group>} groups
 * @param {Entry[]} entries
 */
export async function createGroupings(groups, entries) {
    for (const entry of entries) {
        await grabData(groups, entry);
        groups.get(entry.group).updateLastModified(entry.lastModified);
        groups.get(entry.group).entries.push(entry);
    }

    console.log("Finished creating groupings!");
}

export function getObject(key) {
    return client.send(new GetObjectCommand({
        Bucket: "fuzzing-output",
        Key: key,
    }));
}
