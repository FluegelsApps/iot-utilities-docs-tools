const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const os = require("os");
const archiver = require("archiver");

const FRONTMATTER_TAG = "---";
const FILEEXTENSION_MARKDOWN = ".md";
const JDC_TOC_STARTTAG = "<details open markdown=\"block\">";
const JDC_TOC_ENDTAG = "</details>";

let destination_directory = core.getInput("destination-directory");
let root_directory = core.getInput("root-directory");
let zip_filename = core.getInput("zip-filename");
let index_name = core.getInput("index-name");
let version_code = core.getInput("version-code");

let outputFolder = `${destination_directory}${version_code}`;
let outputZip = `${destination_directory}${zip_filename}`;

try {
    //Create the directory of the compressed zip file
    console.log("Action started");
    if(fs.existsSync(outputFolder)) fs.rmdirSync(outputFolder, { recursive: true, force: true });
    if(fs.existsSync(outputZip)) fs.unlinkSync(outputZip, { recursive: true, force: true });
    fs.mkdirSync(outputFolder);
    copyFolderRecursive(root_directory, outputFolder, 0);
    compressDirectory(outputFolder, outputZip);
} catch (exception) {
    core.setFailed(exception.message);
}

function copyFolderRecursive(origin, destination, level) {
    //Copy the origin directory recursively to the destination directory
    console.log(`Copying directory ${origin} to ${destination}`);

    fs.readdirSync(origin).forEach(node => {
        let newOrigin = `${origin}/${node}`;
        let newDestination = `${destination}/${node}`;

        if(isDirectory(node)) {
            //Copy the subdirectory recursively
            fs.mkdirSync(newDestination);
            copyFolderRecursive(newOrigin, newDestination, level + 1);

            if(fs.readdirSync(newDestination).length == 0) {
                console.log(`Folder ${newDestination} has been removed because it was empty.`);
                fs.rmdirSync(newDestination, { recursive: true, force: true });
            }
        } else if(isMarkdown(node)) {
            if(isIndexFile(node) && level > 1) {
                //Rename the index file
                console.log(`Renaming index file ${newOrigin} and copying to ${newDestination}`);
                let destinationParts = destination.split("/");
                newDestination = `${destination.replace(destinationParts[destinationParts.length - 1], "")}/${getName(origin)}${FILEEXTENSION_MARKDOWN}`;
                let indexContent = adjustMarkdown(fs.readFileSync(newOrigin, "utf-8"));
                fs.writeFileSync(newDestination, indexContent, { flag: 'w+' });
            } else if (level > 0) {
                //Copy a file in the current directory to the destination
                console.log(`Copying file ${newOrigin} to ${newDestination}`);
                let originContent = adjustMarkdown(fs.readFileSync(newOrigin, "utf-8"));
                fs.writeFileSync(newDestination, originContent, { flag: 'w+' });
            }
        }
    });
}

function adjustMarkdown(markdown) {
    //Remove the YAML front matter
    if(markdown.startsWith(FRONTMATTER_TAG)) {
        //Estimate the start and end line of the front matter
        let endIndex = 1;
        let splitContent = markdown.split(os.EOL);

        //Find the end of the YAML front matter
        for(let i = 0; i < splitContent.length; i++) {
            if(splitContent[i] == FRONTMATTER_TAG && i != 0) {
                endIndex = i;
                break;
            }
        }

        //Remove the front matter from the document
        let tempContent = "";
        for(let i = endIndex + 2; i < splitContent.length; i++) tempContent = `${tempContent}${splitContent[i]}${os.EOL}`;
        markdown = tempContent;
    }

    //Remove the just-the-docs table of contents
    if(markdown.includes(JDC_TOC_STARTTAG) && markdown.includes(JDC_TOC_ENDTAG)) {
        let splitContent = markdown.split(os.EOL);

        //Estimate the start and end line of the front matter
        let startIndex = -1;
        let endIndex = -1;

        for(let i = 0; i < splitContent.length; i++) {
            if(splitContent[i] == JDC_TOC_STARTTAG) {
                startIndex = i;
            } else if(splitContent[i] == JDC_TOC_ENDTAG) {
                endIndex = i;
                break;
            }
        }

        //Remove the generated table of contents from the document
        let tempContent = "";
        for(let i = 0; i < splitContent.length; i++) {
            if(i < startIndex || i > endIndex) tempContent = `${tempContent}${splitContent[i]}${os.EOL}`;
        }
        markdown = tempContent;
    }

    //Inject readme front matter
    let readmeFrontMatter = `---${os.EOL}title: ${getMarkdownHeader(markdown)}${os.EOL}excerpt: ${getMarkdownHeader(markdown)}${os.EOL}hidden: false${os.EOL}---${os.EOL}${os.EOL}`;
    markdown = `${readmeFrontMatter}${markdown}`;

    return markdown;
}

function compressDirectory(origin, destination) {
    let output = fs.createWriteStream(destination);
    let archive = archiver("zip");

    console.log(`Starting to compress files... (${destination})`);
    archive.on('finish', function() {
        console.log(`Final zip file has been exported as ${destination}`);
        console.log("Action complete. Cleaning up...");

        fs.rmdirSync(origin, { recursive: true, force: true });
    });
    archive.pipe(output);
    archive.directory(origin, origin);
    archive.finalize();    
}

function getName(node) {
    //Return the name of a file structure node. This returns the last component of the path.
    let pathParts = node.split("/");
    return pathParts[pathParts.length - 1];
}
function getMarkdownHeader(markdown) {
    let header = "";
    for(let line of markdown.split(os.EOL)) {
        if(line.startsWith("#") && !line.toLowerCase().includes("table of contents")) {
            header = line.replace("# ", "");
            break;
        }
    }
    return header;
}

function isDirectory(node) {
    //Check if a file structure node is a directory. This is the case if it has no file extension.
    return !node.includes(".");
}
function isMarkdown(node) {
    //Check if a file structure node is a markdown file. This is the case if it has the markdown file extension ".md".
    return node.endsWith(FILEEXTENSION_MARKDOWN);
}
function isIndexFile(node) {
    //Check if a file structure node is an index file. This is the case if the file contains "index" and ".md".
    return node.endsWith(FILEEXTENSION_MARKDOWN) && node.includes(index_name);
}