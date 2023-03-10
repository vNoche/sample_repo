/**
 *  GENERATE CHANGELOG DATA TO A JSON FILE.
 */

const fs = require("fs");
const path = require("path");
const { gitLogSync } = require("git-log-as-object");
const commitTypes = require("./commitTypes");
// const releaseAsVersion = argv.asVersion;
const { promisify } = require("util");
const exec = promisify(require("child_process").exec);

const AVB_DEV_BOT_EMAIL = "avb-dev-services@avb.net";

//logic for --startHash option. To see aditional yargs options visit https://yargs.js.org/docs/
const argv = require("yargs/yargs")(process.argv.slice(2))
  .option("startHash", {
    alias: "sh",
    describe: "Enter the commit hash you want to initiate the changelog from",
    type: "string",
  })
  .usage("Usage: $0 --startHash [enter commitHash here]")
  .example("$0 --startHash 6108b9cca11fda92c3fc48d1529fb21bda05c01d")
  .check((argvPassed) => {
    if (
      typeof argvPassed.startHash !== "undefined" &&
      argvPassed.startHash.length === 0
    ) {
      throw new SyntaxError(
        "Error: If using option '--startHash' you must enter a commit hash. See usage and example above."
      );
    } else {
      return true;
    }
  }).argv;

const getTitleDate = (commitTime) => {
  const date = commitTime ? new Date(commitTime) : new Date();
  return (
    date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate()
  );
};

const getTicketNumber = (body) => {
  const validPrefix = /(ALTA-|AP-|APS-|MAGE-|MPS-|DESK-|LINQ-|LPS-)/i;
  const ticketPattern = /#([ A-Za-z]*-[0-9-]*)*/;
  const ticketPatternFallBack = /(?:[ A-Za-z]*-[0-9-]*)/;
  const stringCollection =
    body.match(ticketPattern) || body.match(ticketPatternFallBack);

  if (
    stringCollection &&
    validPrefix.test(stringCollection) // TO make that the one we are pulling is the valid Ticket no.
  ) {
    const ticketString = stringCollection[0]
      .replace("#", "")
      .trim()
      .toUpperCase();
    return ticketString.replace(/ +/g, ", ");
  }

  return "No ticket";
};

const parseCommitSubject = (subject, body) => {
  const typePattern = commitTypes.join("|");
  const typeRegex = new RegExp(`^(${typePattern})`);
  const parse = subject.split(/:(.+)/).filter((str) => str);

  // Commits which follow conventional commit
  if (parse.length === 2) {
    const type = (parse[0].match(typeRegex) || [])[0] || null;
    const scope = (parse[0].match(/\((.+)\)/) || [])[1] || null;
    const scopeText = scope
      ? scope
          .split("-")
          .map((text) => {
            if (text === "avb" || text === "ui") {
              return text.toUpperCase();
            }
            return text[0].toUpperCase() + text.slice(1);
          })
          .join(" ")
          .split(",")
          .map((text) => {
            if (text === "AVB UI") {
              return text.split(" ").join("-");
            }
            return text[0].toUpperCase() + text.slice(1);
          })
          .join(",")
      : null;
    const breakingChange = parse[0].endsWith("!");
    const description = parse[1]
      .trim()
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .trim();
    const ticketNumber = getTicketNumber(body);

    return {
      type,
      scope,
      scopeText,
      breakingChange,
      description,
      ticketNumber,
    };
  }

  // Tag commits do not have a conventional commit prefix
  return {
    type: null,
    scope: null,
    scopeText: null,
    description: parse[0].trim(),
    breakingChange: false,
    ticketNumber: null,
  };
};

const getGitTags = async (gitHash) => {
  try {
    const { stdout: tag } = await exec(
      `git tag --contains ${gitHash} | head -n1`
    );

    return tag;
  } catch (error) {
    console.error("There was an error gathering tags", error);
  }
};

const getLogTree = async (log) => {
  const logTree = {
    unreleased: {
      title: "Unreleased",
      date: null,
      commits: [],
    },
  };

  for (const entry of log) {
    const {
      commitTime,
      fullHash,
      committer: { email },
    } = entry;

    // ignore commits by the dev bot
    if (email === AVB_DEV_BOT_EMAIL) {
      continue;
    }

    const earliestTag = await getGitTags(fullHash);
    // no tag so must be unreleased commit
    if (!earliestTag) {
      logTree["unreleased"].commits.push(entry);
      continue;
    }

    const earliestTagFormatted = earliestTag.trim();

    if (!logTree[earliestTagFormatted]) {
      logTree[earliestTagFormatted] = {
        title: earliestTagFormatted,
        date: getTitleDate(commitTime),
        commits: [],
      };
    }
    logTree[earliestTagFormatted].commits.push(entry);
  }

  return logTree;
};
// let curTag = releaseAsVersion ? `v${version}` : 'unreleased';

const log = gitLogSync({
  startRef: argv.startHash
    ? argv.startHash
    : "94ae31de9da4de39a90294f0eab2934473cb4902",
}).map((entry) => {
  const { subject, body } = entry;
  const subjectSanitize = subject.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bodySanitize = body.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return {
    ...entry,
    ...parseCommitSubject(subjectSanitize, bodySanitize),
    subject: subjectSanitize,
    body: bodySanitize,
  };
});

getLogTree(log)
  .then((logTree) => {
    fs.writeFileSync(
      path.resolve(__dirname, "../", "changelog.json"),
      JSON.stringify(logTree, null, 2),
      "utf-8"
    );
  })
  .catch((error) =>
    console.error("There was an error creating the changelog", error)
  );
