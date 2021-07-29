const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const os = require("os");
const archiver = require("archiver");

const FRONTMATTER_TAG = "---";
const FILEEXTENSION_MARKDOWN = ".md";

let destination_directory = core.getInput("destination-directory");
let root_directory = core.getInput("root-directory");
let zip_filename = core.getInput("zip-filename");
let index_name = core.getInput("index-name");

let outputFolder = `${destination_directory}${zip_filename.replace(".zip", "")}`;
let outputZip = `${destination_directory}${zip_filename}`;

try {
    //Create the directory of the compressed zip file
    console.log("Action started");
    if(fs.existsSync(outputFolder)) fs.rmdirSync(outputFolder, { recursive: true, force: true });
    if(fs.existsSync(outputZip)) fs.unlinkSync(outputZip, { recursive: true, force: true });
    fs.mkdirSync(outputFolder);
    copyFolderRecursive(root_directory, outputFolder);
    compressDirectory(outputFolder, outputZip);
} catch (exception) {
    core.setFailed(exception.message);
}

function copyFolderRecursive(origin, destination) {
    //Copy the origin directory recursively to the destination directory
    console.log(`Copying directory ${origin} to ${destination}`);
    fs.readdirSync(origin).forEach(node => {
        let newOrigin = `${origin}/${node}`;
        let newDestination = `${destination}/${node}`;

        if(isDirectory(node)) {
            //Copy the subdirectory recursively
            fs.mkdirSync(newDestination);
            copyFolderRecursive(newOrigin, newDestination);
        } else if(isMarkdown(node)) {
            if(isIndexFile(node)) {
                //Rename the index file
                console.log(`Renaming index file ${newOrigin} and copying to ${newDestination}`);
                newDestination = `${destination}/${getName(origin)}${FILEEXTENSION_MARKDOWN}`;
                let indexContent = adjustMarkdown(fs.readFileSync(newOrigin, "utf-8"));
                fs.writeFileSync(newDestination, indexContent, { flag: 'w+' });
            } else {
                //Copy a file in the current directory to the destination
                console.log(`Copying file ${newOrigin} to ${newDestination}`);
                let originContent = adjustMarkdown(fs.readFileSync(newOrigin, "utf-8"));
                fs.writeFileSync(newDestination, originContent, { flag: 'w+' });
            }
        }
    });
}

function adjustMarkdown(markdown) {
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
        for(let i = endIndex; i < splitContent.length; i++) tempContent = `${tempContent}${splitContent[i]}${os.EOL}`;
        markdown = tempContent;
    }

    //Inject readme front matter
    let readmeFrontMatter = `---${os.EOL}title: ${getMarkdownHeader(markdown)}${os.EOL}excerpt: ${getMarkdownHeader(markdown)}${os.EOL}---${os.EOL}${os.EOL}`;
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
    fs.readdirSync(origin).forEach(node => {
        let subNode = `${origin}/${node}`.replace("./", "");
        if(isDirectory(node)) {
            console.log(`Archiving directory in current directory: ${subNode}`);
            archive.directory(subNode, subNode);
        } else {
            console.log(`Archiving file in current directory: ${subNode}`);
            archive.file(subNode, { name: subNode });
        } 
    });
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